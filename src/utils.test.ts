import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import yaml from 'js-yaml';

const mockFetch = vi.fn();
vi.mock('unfetch', () => ({ default: (...args: unknown[]) => mockFetch(...args) }));

import { formatYamlError, getJobStatus, executeStage, executeStageAndGetStatus, silentFetcher, exitLab, restartLab, completeLab } from './utils';

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
      json: () => Promise.resolve({ Status: 'successful', Output: 'done' }),
    });

    const result = await getJobStatus('job-1');
    expect(result).toEqual({ Status: 'successful', Output: 'done' });
  });

  it('resolves on failed status', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ Status: 'failed', Output: 'error msg' }),
    });

    const result = await getJobStatus('job-2');
    expect(result).toEqual({ Status: 'failed', Output: 'error msg' });
  });

  it('polls until non-terminal status transitions to successful', async () => {
    mockFetch
      .mockResolvedValueOnce({ json: () => Promise.resolve({ Status: 'running' }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ Status: 'scheduled' }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ Status: 'successful' }) });

    const promise = getJobStatus('job-3');

    await vi.advanceTimersByTimeAsync(1000); // first backoff
    await vi.advanceTimersByTimeAsync(2000); // second backoff (doubled)

    const result = await promise;
    expect(result.Status).toBe('successful');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('times out after maxAttempts and returns failed', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ Status: 'running' }),
    });

    const promise = getJobStatus('job-timeout');

    for (let i = 0; i < 65; i++) {
      await vi.advanceTimersByTimeAsync(10_000);
    }

    const result = await promise;
    expect(result.Status).toBe('failed');
    expect(result.Output).toContain('timed out');
  });

  it('caps backoff delay at 10 seconds', async () => {
    mockFetch
      .mockResolvedValueOnce({ json: () => Promise.resolve({ Status: 'running' }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ Status: 'running' }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ Status: 'running' }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ Status: 'running' }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ Status: 'running' }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ Status: 'successful' }) });

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

  it('returns null when response has no Job_id field', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const result = await executeStage('module-01', 'validation');
    expect(result).toBeNull();
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
