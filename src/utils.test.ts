import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import yaml from 'js-yaml';

const mockFetch = vi.fn();
vi.mock('unfetch', () => ({ default: (...args: unknown[]) => mockFetch(...args) }));

import {
  formatYamlError,
  getJobStatus,
  getPollDelayMs,
  executeStage,
  executeStageAndGetStatus,
  silentFetcher,
  exitLab,
  restartLab,
  completeLab,
  formatStageLabel,
} from './utils';

describe('formatYamlError', () => {
  it('formats js-yaml duplicated key error with code frame and caret', () => {
    const sourceName = './ui-config.yml';
    const source = ['type: showroom', '', 'tabs:', 'tabs:', '- name: Foo'].join('\n');

    let thrown: unknown = null;
    try {
      yaml.load(source);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeTruthy();

    const out = formatYamlError(thrown, source, sourceName);
    expect(out).toContain(`YAML parse error in ${sourceName}`);
    expect(out).toMatch(/Location: line \d+, column \d+/);
    expect(out).toMatch(/Reason: .*duplicated mapping key/i);
    expect(out).toContain('tabs:');
    expect(out).toContain('^');
  });

  it('handles non-yaml errors without mark gracefully', () => {
    const err = new Error('Something bad');
    const source = 'a: 1\n';
    const out = formatYamlError(err, source, 'config.yml');
    expect(out).toContain('YAML parse error in config.yml');
    expect(out).toContain('Reason: Something bad');
    expect(out).toContain('1 | a: 1');
    expect(out).toContain('^');
  });
});

describe('getPollDelayMs', () => {
  it('uses a 250ms delay for the first 6 attempts', () => {
    expect(getPollDelayMs(1)).toBe(250);
    expect(getPollDelayMs(6)).toBe(250);
  });

  it('uses a 1s delay for attempts 7 through 12', () => {
    expect(getPollDelayMs(7)).toBe(1_000);
    expect(getPollDelayMs(12)).toBe(1_000);
  });

  it('ramps up exponentially (x1.5) starting at attempt 13', () => {
    expect(getPollDelayMs(13)).toBe(1_500);
    expect(getPollDelayMs(14)).toBe(2_250);
  });

  it('caps the backoff delay at 5 seconds', () => {
    expect(getPollDelayMs(16)).toBe(5_000);
    expect(getPollDelayMs(120)).toBe(5_000);
  });
});

describe('getJobStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    mockFetch.mockReset();
  });

  it('resolves immediately when first poll returns successful', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ Status: 'successful', Output: 'done' }),
    });

    const result = await getJobStatus('job-1');
    expect(result).toEqual({ Status: 'successful', Output: 'done' });
  });

  it('resolves on failed status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ Status: 'failed', Output: 'error msg' }),
    });

    const result = await getJobStatus('job-2');
    expect(result).toEqual({ Status: 'failed', Output: 'error msg' });
  });

  it('rejects an HTTP failure instead of polling indefinitely', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(getJobStatus('job-500')).rejects.toThrow('Job status request failed (HTTP 500)');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('polls until non-terminal status transitions to successful', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ Status: 'running' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ Status: 'scheduled' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ Status: 'successful' }) });

    const promise = getJobStatus('job-3');

    // Two fast-tier (250ms) delays between the three polls above.
    await vi.advanceTimersByTimeAsync(getPollDelayMs(1));
    await vi.advanceTimersByTimeAsync(getPollDelayMs(2));

    const result = await promise;
    expect(result.Status).toBe('successful');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('polls at exactly 250ms during the fast tier (attempts 1-6), not before', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ Status: 'running' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ Status: 'successful' }) });

    const promise = getJobStatus('job-fast-tier');
    // The first check fires synchronously -- no delay before it.
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(249);
    expect(mockFetch).toHaveBeenCalledTimes(1); // not yet -- would have fired by now under the old 1s/2s/4s backoff

    await vi.advanceTimersByTimeAsync(1);
    expect(mockFetch).toHaveBeenCalledTimes(2); // fires at exactly 250ms

    await promise;
  });

  it('switches to a 1s delay once past the fast tier (attempt 7 onward)', async () => {
    let calls = 0;
    mockFetch.mockImplementation(() => {
      calls += 1;
      const Status = calls >= 8 ? 'successful' : 'running';
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ Status }) });
    });

    const promise = getJobStatus('job-mid-tier');

    // Sum of the six fast-tier (250ms) delays between attempts 1-6 lands
    // exactly on the 7th fetch call.
    const throughFastTier = [1, 2, 3, 4, 5, 6].reduce((sum, a) => sum + getPollDelayMs(a), 0);
    await vi.advanceTimersByTimeAsync(throughFastTier);
    expect(calls).toBe(7);

    // The next delay (attempt 7) should be 1s, not another 250ms.
    await vi.advanceTimersByTimeAsync(getPollDelayMs(7) - 1);
    expect(calls).toBe(7);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(8);

    const result = await promise;
    expect(result.Status).toBe('successful');
  });

  it('caps the backoff delay at 5 seconds (not 10) once in the exponential tier', async () => {
    let calls = 0;
    mockFetch.mockImplementation(() => {
      calls += 1;
      const Status = calls >= 17 ? 'successful' : 'running';
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ Status }) });
    });

    const promise = getJobStatus('job-backoff-cap');

    // Cumulative delay for attempts 1-15 lands exactly on the 16th fetch
    // call; attempt 16's delay (getPollDelayMs(16) === 5_000) should
    // already be capped at this point.
    const through15 = Array.from({ length: 15 }, (_, i) => i + 1).reduce((sum, a) => sum + getPollDelayMs(a), 0);
    await vi.advanceTimersByTimeAsync(through15);
    expect(calls).toBe(16);
    expect(getPollDelayMs(16)).toBe(5_000);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(calls).toBe(16); // the real 5s cap hasn't elapsed yet

    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(17); // fires at exactly 5s, confirming the cap is 5s, not the old 10s

    const result = await promise;
    expect(result.Status).toBe('successful');
  });

  it('times out after maxAttempts with an operational error, not validation output', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ Status: 'running' }),
    });

    const promise = getJobStatus('job-timeout');
    const rejection = expect(promise).rejects.toThrow('Job status polling timed out');

    for (let i = 0; i < 65; i++) {
      await vi.advanceTimersByTimeAsync(10_000);
    }

    // 1 initial check + 120 retries -- pins down maxAttempts so a future
    // change to it (without updating the "~9 minute" budget comment next
    // to it) shows up here.
    expect(mockFetch).toHaveBeenCalledTimes(121);
    await rejection;
  });

  it('caps backoff delay at 10 seconds', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ Status: 'running' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ Status: 'running' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ Status: 'running' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ Status: 'running' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ Status: 'running' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ Status: 'successful' }) });

    const promise = getJobStatus('job-backoff');

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    await vi.advanceTimersByTimeAsync(8000);
    await vi.advanceTimersByTimeAsync(10000);

    const result = await promise;
    expect(result.Status).toBe('successful');
  });
});

describe('executeStage', () => {
  afterEach(() => {
    mockFetch.mockReset();
  });

  it('returns Job_id on successful response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ Job_id: 'abc-123' }),
    });

    const result = await executeStage('module-01', 'setup');
    expect(result).toBe('abc-123');
    expect(mockFetch).toHaveBeenCalledWith('/runner/api/module-01/setup', { method: 'POST' });
  });

  it('returns null on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await executeStage('nonexistent', 'setup');
    expect(result).toBeNull();
  });

  it('throws on a server error rather than treating it as a missing script', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(executeStage('module-01', 'validation')).rejects.toThrow('Automation request failed (HTTP 500)');
  });

  it('throws when a successful response has no Job_id field', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await expect(executeStage('module-01', 'validation')).rejects.toThrow('Automation request did not return a job ID');
  });
});

describe('executeStageAndGetStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    mockFetch.mockReset();
  });

  it('combines executeStage and getJobStatus on success', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ Job_id: 'job-xyz' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ Status: 'successful', Output: 'all good' }),
      });

    const result = await executeStageAndGetStatus('module-01', 'validation');
    expect(result).toEqual({ Status: 'successful', Output: 'all good' });
  });

  it('returns Script not found when executeStage returns null', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await executeStageAndGetStatus('missing', 'setup');
    expect(result).toEqual({ Status: 'successful', Output: 'Script not found' });
  });
});

describe('silentFetcher', () => {
  afterEach(() => {
    mockFetch.mockReset();
  });

  it('returns parsed JSON on 200', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'hello' }),
    });

    const result = await silentFetcher('/api/config');
    expect(result).toEqual({ data: 'hello' });
  });

  it('returns null on 404 without throwing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await silentFetcher('/api/missing');
    expect(result).toBeNull();
  });

  it('returns null on network error without throwing', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    const result = await silentFetcher('/api/broken');
    expect(result).toBeNull();
  });

  it('returns null on non-404 error status (catches internally)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const result = await silentFetcher('/api/error');
    expect(result).toBeNull();
  });
});

describe('postMessage lifecycle', () => {
  let postMessageSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    postMessageSpy = vi.fn();
    Object.defineProperty(window, 'parent', {
      value: { postMessage: postMessageSpy },
      writable: true,
    });
    Object.defineProperty(window, 'location', {
      value: { protocol: 'http:', hostname: 'localhost', search: '', origin: 'http://localhost' },
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exitLab sends DELETE to parent origin', () => {
    exitLab();
    expect(postMessageSpy).toHaveBeenCalledWith('DELETE', 'http://localhost');
  });

  it('restartLab sends RESTART to parent origin', () => {
    restartLab();
    expect(postMessageSpy).toHaveBeenCalledWith('RESTART', 'http://localhost');
  });

  it('completeLab sends COMPLETED to parent origin', () => {
    completeLab();
    expect(postMessageSpy).toHaveBeenCalledWith('COMPLETED', 'http://localhost');
  });
});

describe('formatStageLabel', () => {
  it('capitalizes a plain word', () => {
    expect(formatStageLabel('healthcheck')).toBe('Healthcheck');
  });

  it('upper-cases short alphanumeric abbreviations like e2e', () => {
    expect(formatStageLabel('e2e')).toBe('E2E');
  });

  it('capitalizes each hyphen/underscore-separated word', () => {
    expect(formatStageLabel('smoke-test')).toBe('Smoke Test');
    expect(formatStageLabel('smoke_test')).toBe('Smoke Test');
  });

  it('mixes capitalization and abbreviation rules across words', () => {
    expect(formatStageLabel('e2e-suite')).toBe('E2E Suite');
  });
});
