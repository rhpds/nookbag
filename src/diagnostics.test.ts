import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Behavioral tests for the diagnostics page's orchestration
 * (runDiagnostics in src/public/diagnostics.js): specifically, that report
 * sections are rendered to the DOM progressively as each check settles,
 * rather than the user staring at a single "Running diagnostics…" message
 * until every check (including the slowest ones) finishes.
 *
 * diagnostics.js is a classic, non-module <script> that wires up DOM
 * elements and auto-runs on load, reading window.DiagnosticsTabs (set by
 * diagnostics-tabs.js, loaded first on the real page). We replicate that
 * loading order here via dynamic import with full control over `fetch` and
 * the DOM it operates on.
 */

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// Flush the microtask queue. diagnostics.js's happy paths never interpose a
// real timer, so a single macrotask tick drains every microtask queued (and
// re-queued while draining) in response to a resolved fetch.
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const THROUGHPUT_URL = 'https://speed.cloudflare.com/__down?bytes=2000000';
const SERVER_DIAGNOSTICS_URL = '/runner/api/diagnostics';

function setupDiagnosticsDom() {
  document.body.innerHTML = `
    <button id="run-btn" type="button">Run Diagnostics</button>
    <button id="copy-btn" type="button" disabled>Copy All</button>
    <span id="status"></span>
    <pre id="report">Running diagnostics…</pre>
  `;
}

describe('diagnostics.js progressive rendering', () => {
  let throughputDeferred: ReturnType<typeof deferred<unknown>>;
  let serverDiagnosticsDeferred: ReturnType<typeof deferred<unknown>>;

  beforeEach(() => {
    vi.resetModules();
    setupDiagnosticsDom();

    throughputDeferred = deferred();
    serverDiagnosticsDeferred = deferred();

    global.fetch = vi.fn((url: string) => {
      if (url === './ping.txt') {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => new Date().toUTCString() },
          text: () => Promise.resolve('ok'),
        } as unknown as Response);
      }
      if (url === './ui-config.yml' || url === './zero-touch-config.yml') {
        return Promise.resolve({ ok: false, status: 404 } as unknown as Response);
      }
      if (url === '/runner/health') {
        return Promise.resolve({ ok: true, status: 200 } as unknown as Response);
      }
      if (url.includes('generate_204') || url.includes('favicon.ico')) {
        return Promise.resolve({} as unknown as Response);
      }
      if (url === THROUGHPUT_URL) {
        return throughputDeferred.promise as Promise<Response>;
      }
      if (url === SERVER_DIAGNOSTICS_URL) {
        return serverDiagnosticsDeferred.promise as Promise<Response>;
      }
      return Promise.reject(new Error(`unexpected fetch url in test: ${url}`));
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function loadDiagnosticsPage() {
    await import('./public/diagnostics-tabs.js');
    await import('./public/diagnostics.js');
  }

  it('renders synchronous sections immediately, before any network call settles', async () => {
    await loadDiagnosticsPage();

    const report = document.getElementById('report')!;
    // No `await tick()` yet -- nothing network-dependent has had a chance
    // to resolve. Environment info and page-load timing are computed
    // synchronously in runDiagnostics() before any `await`, so they must
    // already be in the DOM.
    expect(report.textContent).toContain('Browser / Connection');
    expect(report.textContent).toContain('This Page Load Timing');
    // Everything that depends on a network round trip is still pending.
    expect(report.textContent).toContain('(running…)');
  });

  it('updates the throughput section as soon as it settles, independent of the still-pending server-diagnostics section', async () => {
    await loadDiagnosticsPage();
    await tick();
    await tick();

    const report = document.getElementById('report')!;
    // Both still pending at this point -- neither deferred has resolved.
    const throughputSection = () => report.textContent!.split('--- Automation API')[0];
    expect(throughputSection()).toContain('(running…)');

    throughputDeferred.resolve({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(2_000_000)),
    } as unknown as Response);
    await tick();
    await tick();

    // Throughput settled and is now rendered...
    expect(report.textContent).toContain('~2MB download:');
    // ...while server diagnostics -- a distinct, independently-resolving
    // check -- is still shown as pending (the "Round trip:" label is
    // rendered immediately regardless of pending state, but its value
    // isn't yet), proving sections update as they individually settle
    // rather than all appearing together at the end.
    expect(report.textContent!.split('--- Automation API')[1]).toContain('(running…)');
    expect(report.textContent).not.toContain('Uptime:');

    serverDiagnosticsDeferred.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          uptime_seconds: 42,
          cpu: null,
          memory: null,
          load_average: { available: false, reason: 'n/a' },
          disk: null,
          job_queue: null,
          k8s_api: null,
          bastion: null,
        }),
    } as unknown as Response);
    await tick();
    await tick();

    expect(report.textContent).toContain('Round trip:');
    expect(report.textContent).not.toContain('(running…)');
    expect(document.getElementById('status')!.textContent).toContain('Done');
    expect((document.getElementById('copy-btn') as HTMLButtonElement).disabled).toBe(false);
  });
});
