/**
 * Nookbag Diagnostics Page
 *
 * Deliberately plain, dependency-free JS (no build step, no React, no
 * ui-config.yml parsing dependency beyond a best-effort tab-origin
 * extraction below) so this page keeps working even if the main app's
 * config loading or the automation API is totally broken -- see
 * src/public/placeholder.html for the same "standalone static page"
 * pattern this follows.
 *
 * Uses async/await throughout: this already depends on fetch/
 * AbortController/Promise.all, which require the same modern-browser
 * baseline as async/await, so there's no compatibility reason to write
 * this in older .then()-chain style.
 *
 * Every network call goes through fetchWithTimeout() -- a diagnostics
 * tool that can itself hang forever on a slow/wedged request defeats its
 * own purpose, which is exactly the "cluster is slow" scenario it exists
 * to diagnose.
 *
 * Produces one plain-text report covering:
 *   - Browser/connection environment info
 *   - This page's own load timing (Navigation Timing API)
 *   - Clock skew between browser and this server
 *   - Repeated latency samples against: this lab (same-origin), the
 *     automation sidecar, any services configured in ui-config.yml tabs,
 *     and fixed "internet baseline" targets (Cloudflare/Google/Red Hat)
 *   - A rough single-stream throughput sample
 *   - Server-side pod diagnostics (CPU/memory pressure, job backlog,
 *     in-cluster reachability) fetched from /runner/api/diagnostics
 */
(function () {
  'use strict';

  const SAMPLES_PER_TARGET = 5;
  const PROBE_TIMEOUT_MS = 4000;
  // /runner/api/diagnostics can legitimately take a few seconds server-side
  // (a bounded cgroup sample sleep plus up to two 2s-timeout TCP connects),
  // so its client-side timeout needs enough headroom not to falsely report
  // "unreachable" while it's still doing its own bounded work.
  const SERVER_DIAGNOSTICS_TIMEOUT_MS = 8000;
  const THROUGHPUT_TIMEOUT_MS = 15000;

  const SAME_ORIGIN_TARGETS = [
    { label: 'This lab (same-origin, via cluster ingress)', url: './ping.txt' },
    { label: 'Automation sidecar (/runner/health)', url: '/runner/health' },
  ];

  // Purpose-built connectivity-check endpoints (not arbitrary pages), so
  // no-cors GETs behave predictably: generate_204-style endpoints are
  // designed for exactly this kind of probe and won't false-timeout the
  // way e.g. Cloudflare's cdn-cgi/trace does on non-GET or bot-managed
  // requests.
  const INTERNET_BASELINE_TARGETS = [
    { label: 'Internet baseline: Cloudflare', url: 'https://cp.cloudflare.com/generate_204', mode: 'no-cors' },
    { label: 'Internet baseline: Google', url: 'https://www.google.com/generate_204', mode: 'no-cors' },
    { label: 'Internet baseline: Red Hat', url: 'https://access.redhat.com/favicon.ico', mode: 'no-cors' },
  ];

  const THROUGHPUT_TEST_URL = 'https://speed.cloudflare.com/__down?bytes=2000000';

  // ---------------------------------------------------------------------
  // DOM wiring
  // ---------------------------------------------------------------------

  const runBtn = document.getElementById('run-btn');
  const copyBtn = document.getElementById('copy-btn');
  const statusEl = document.getElementById('status');
  const reportEl = document.getElementById('report');

  function setStatus(message) {
    statusEl.textContent = message;
  }

  function setRunning(isRunning) {
    runBtn.disabled = isRunning;
    copyBtn.disabled = isRunning || !reportEl.dataset.hasReport;
  }

  // ---------------------------------------------------------------------
  // Shared fetch-with-timeout helper
  // ---------------------------------------------------------------------

  /**
   * fetch() with a bounded timeout via AbortController, cleared in
   * `finally` either way (success, failure, or abort) so the timer never
   * outlives the request -- see MDN's AbortSignal docs and the common
   * "clear the timer in finally" pattern for avoiding the classic
   * Promise.race-based fetch-timeout memory leak.
   */
  async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------------------------------------------------------------------
  // Environment / connection info (no network calls)
  // ---------------------------------------------------------------------

  function getEnvironmentInfo() {
    const nav = window.navigator;
    const conn = 'connection' in nav ? nav.connection : null;
    // navigator.connection is Chromium-only (Chrome/Edge/Android) and is
    // explicitly "not Baseline" -- Firefox and Safari never expose it.
    const networkInfo = conn
      ? {
          effectiveType: conn.effectiveType,
          downlinkMbps: conn.downlink,
          rttMs: conn.rtt,
          saveData: conn.saveData,
        }
      : 'not available in this browser';

    let timezone = 'unknown';
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (_err) {
      // Intl unavailable or misconfigured; leave the 'unknown' default.
    }

    return {
      userAgent: nav.userAgent,
      platform: nav.platform || 'unknown',
      language: nav.language || 'unknown',
      onLine: nav.onLine,
      screen: `${window.screen.width}x${window.screen.height} (@${window.devicePixelRatio || 1}x)`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      timezone,
      networkInformationApi: networkInfo,
    };
  }

  // ---------------------------------------------------------------------
  // This page's own load timing (Navigation Timing API)
  // ---------------------------------------------------------------------

  function getPageLoadTiming() {
    if (!window.performance || typeof window.performance.getEntriesByType !== 'function') {
      return { available: false, reason: 'Performance API unavailable' };
    }
    const [entry] = window.performance.getEntriesByType('navigation');
    if (!entry) {
      return { available: false, reason: 'Navigation Timing API unavailable' };
    }
    const delta = (a, b) => Math.max(0, Math.round(entry[b] - entry[a]));
    return {
      available: true,
      dnsMs: delta('domainLookupStart', 'domainLookupEnd'),
      tcpMs: delta('connectStart', 'connectEnd'),
      tlsMs: entry.secureConnectionStart > 0 ? delta('secureConnectionStart', 'connectEnd') : 0,
      ttfbMs: delta('requestStart', 'responseStart'),
      downloadMs: delta('responseStart', 'responseEnd'),
      totalMs: Math.round(entry.duration),
    };
  }

  // ---------------------------------------------------------------------
  // Clock skew (browser vs. this server)
  // ---------------------------------------------------------------------

  async function getClockSkew() {
    const localBefore = Date.now();
    try {
      const res = await fetchWithTimeout('./ping.txt', { cache: 'no-store' }, PROBE_TIMEOUT_MS);
      const localAfter = Date.now();
      const serverDateHeader = res.headers.get('date');
      if (!serverDateHeader) {
        return { available: false, reason: 'Server did not send a Date header' };
      }
      const serverTime = new Date(serverDateHeader).getTime();
      const localTime = Math.round((localBefore + localAfter) / 2);
      return {
        available: true,
        skewMs: localTime - serverTime,
        localIso: new Date(localTime).toISOString(),
        serverIso: new Date(serverTime).toISOString(),
      };
    } catch (err) {
      return { available: false, reason: String(err) };
    }
  }

  // ---------------------------------------------------------------------
  // Repeated latency probes
  // ---------------------------------------------------------------------

  async function singleProbe(url, mode) {
    const opts = { method: 'GET', cache: 'no-store', credentials: 'omit' }; // no-store is critical: without it, samples 2-5 could hit the browser cache instantly.
    if (mode) opts.mode = mode;
    const start = window.performance.now();
    try {
      await fetchWithTimeout(url, opts, PROBE_TIMEOUT_MS);
      return window.performance.now() - start;
    } catch (_err) {
      return null;
    }
  }

  async function repeatedProbe(label, url, mode) {
    const samples = [];
    // Sequential, not parallel: this is deliberately "ping"-style sampling
    // spread out over time, and it lets the natural TCP/TLS connection-reuse
    // speedup on samples 2-5 show up as signal (min vs. avg/max spread)
    // instead of being hidden by firing every sample at once.
    for (let i = 0; i < SAMPLES_PER_TARGET; i++) {
      samples.push(await singleProbe(url, mode));
    }
    const ok = samples.filter((s) => s !== null).sort((a, b) => a - b);
    const failures = samples.length - ok.length;
    if (ok.length === 0) {
      return { label, url, available: false, failures, samples: samples.length };
    }
    const sum = ok.reduce((a, b) => a + b, 0);
    return {
      label,
      url,
      available: true,
      failures,
      samples: samples.length,
      minMs: Math.round(ok[0]),
      avgMs: Math.round(sum / ok.length),
      medianMs: Math.round(ok[Math.floor(ok.length / 2)]),
      maxMs: Math.round(ok[ok.length - 1]),
    };
  }

  // ---------------------------------------------------------------------
  // Configured tab origins (from ui-config.yml / zero-touch-config.yml)
  // ---------------------------------------------------------------------

  async function fetchConfigText() {
    const candidates = ['./ui-config.yml', './zero-touch-config.yml'];
    for (const url of candidates) {
      try {
        const res = await fetchWithTimeout(url, { cache: 'no-store' }, PROBE_TIMEOUT_MS);
        if (res.ok) return await res.text();
      } catch (_err) {
        // Try the next candidate; a fully-missing config just yields an
        // empty "configured services" section further down.
      }
    }
    return null;
  }

  function stripQuotes(s) {
    return s.replace(/^['"]|['"]$/g, '');
  }

  /**
   * Deliberately minimal, NOT a general YAML parser: extracts only the
   * small, flat `tabs:` list shape nookbag's own config schema actually
   * uses (see docs/UI-CONFIG.md / src/config-schema.ts) -- `- name:` items
   * with plain `url:`/`port:`/`path:`/`external:` fields, no nested
   * mappings. Any config that doesn't match this shape just yields fewer
   * probe targets; it never throws (callers still wrap this defensively).
   */
  function parseConfiguredTabs(yamlText) {
    const lines = yamlText.split(/\r?\n/);
    const tabs = [];
    let inTabs = false;
    let current = null;

    function flush() {
      if (current && (current.url || (current.port && current.path))) {
        tabs.push(current);
      }
      current = null;
    }

    for (const rawLine of lines) {
      const line = rawLine.replace(/\s+$/, '');
      const trimmed = line.trim();
      if (!trimmed || trimmed.charAt(0) === '#') continue;

      const indent = line.length - line.replace(/^\s+/, '').length;

      if (indent === 0) {
        if (/^tabs\s*:/.test(trimmed)) {
          inTabs = true;
        } else {
          if (inTabs) flush();
          inTabs = false;
        }
        continue;
      }

      if (!inTabs) continue;

      const itemMatch = /^-\s*name\s*:\s*(.+)$/.exec(trimmed);
      if (itemMatch) {
        flush();
        current = { name: stripQuotes(itemMatch[1].trim()) };
        continue;
      }

      if (!current) continue;

      const fieldMatch = /^(url|port|path|external)\s*:\s*(.+)$/.exec(trimmed);
      if (fieldMatch) {
        const [, key, rawValue] = fieldMatch;
        const value = stripQuotes(rawValue.trim());
        current[key] = key === 'external' ? value === 'true' : value;
      }
    }
    flush();
    return tabs;
  }

  function tabProbeUrl(tab) {
    if (tab.url) return tab.url;
    if (tab.port && tab.path) {
      return `${window.location.protocol}//${window.location.hostname}:${tab.port}${tab.path}`;
    }
    return null;
  }

  async function getConfiguredTabTargets() {
    const text = await fetchConfigText();
    if (!text) return [];

    let tabs;
    try {
      tabs = parseConfiguredTabs(text);
    } catch (_err) {
      return [];
    }

    const seen = new Set();
    const targets = [];
    for (const tab of tabs) {
      const url = tabProbeUrl(tab);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      targets.push({ label: `Configured service: ${tab.name || url}`, url, mode: 'no-cors' });
    }
    return targets;
  }

  // ---------------------------------------------------------------------
  // Rough throughput sample (single stream, approximate)
  // ---------------------------------------------------------------------

  async function getThroughputSample() {
    const start = window.performance.now();
    try {
      const res = await fetchWithTimeout(THROUGHPUT_TEST_URL, { cache: 'no-store' }, THROUGHPUT_TIMEOUT_MS);
      const buf = await res.arrayBuffer();
      const elapsedS = (window.performance.now() - start) / 1000;
      const mbps = elapsedS > 0 ? (buf.byteLength * 8) / elapsedS / 1000000 : null;
      return {
        available: true,
        bytes: buf.byteLength,
        seconds: Math.round(elapsedS * 100) / 100,
        approxMbps: mbps !== null ? Math.round(mbps * 10) / 10 : null,
      };
    } catch (err) {
      return { available: false, reason: String(err) };
    }
  }

  // ---------------------------------------------------------------------
  // Server-side diagnostics (automation pod -- things the browser can't see)
  // ---------------------------------------------------------------------

  async function getServerDiagnostics() {
    const start = window.performance.now();
    try {
      const res = await fetchWithTimeout(
        '/runner/api/diagnostics',
        { cache: 'no-store' },
        SERVER_DIAGNOSTICS_TIMEOUT_MS
      );
      const roundTripMs = Math.round(window.performance.now() - start);
      if (!res.ok) {
        return { available: false, roundTripMs, reason: `HTTP ${res.status}` };
      }
      const data = await res.json();
      return { available: true, roundTripMs, data };
    } catch (err) {
      const roundTripMs = Math.round(window.performance.now() - start);
      return { available: false, roundTripMs, reason: String(err) };
    }
  }

  // ---------------------------------------------------------------------
  // Report formatting
  // ---------------------------------------------------------------------

  function padLabel(label, width) {
    return label.length >= width ? label : label + ' '.repeat(width - label.length);
  }

  function formatLatencyRow(r) {
    if (!r.available) {
      return `  ${padLabel(r.label, 46)}FAILED (${r.failures}/${r.samples} attempts)`;
    }
    const failureNote = r.failures ? `  (failures: ${r.failures}/${r.samples})` : '';
    return `  ${padLabel(r.label, 46)}min/avg/median/max = ${r.minMs}/${r.avgMs}/${r.medianMs}/${r.maxMs} ms${failureNote}`;
  }

  function formatCpu(cpu) {
    if (!cpu) return 'not available';
    if (!cpu.available) return cpu.reason || 'not available';
    const parts = [cpu.cpu_limit_cores != null ? `${cpu.cpu_limit_cores} cores limit` : 'no CPU limit'];
    if (cpu.lifetime_throttled_pct != null) {
      parts.push(`${cpu.lifetime_throttled_pct}% lifetime throttled`);
    }
    parts.push(cpu.throttling_now ? 'THROTTLING RIGHT NOW' : 'not currently throttling');
    return `${parts.join(', ')} (cgroup ${cpu.cgroup_version})`;
  }

  function formatMemory(mem) {
    if (!mem) return 'not available';
    if (!mem.available) return mem.reason || 'not available';
    const usedMi = Math.round(mem.used_bytes / (1024 * 1024));
    const limitMi = mem.limit_bytes ? `${Math.round(mem.limit_bytes / (1024 * 1024))}Mi` : 'no limit';
    return `${usedMi}Mi used / ${limitMi} (cgroup ${mem.cgroup_version})`;
  }

  function formatDisk(disk) {
    if (!disk) return 'not available';
    if (!disk.available) return disk.reason || 'not available';
    const freeGi = (disk.free_bytes / 1024 ** 3).toFixed(2);
    const totalGi = (disk.total_bytes / 1024 ** 3).toFixed(2);
    return `${freeGi}Gi free / ${totalGi}Gi total`;
  }

  function formatReachability(r) {
    if (!r) return 'not available';
    if (!r.available) return r.reason || 'unreachable';
    return `${r.connect_ms}ms TCP connect to ${r.host}:${r.port}`;
  }

  function buildReport(state) {
    const { environment: env, pageLoadTiming: t, clockSkew: skew, throughput: tp, serverDiagnostics: sd } = state;
    const lines = [];

    lines.push('```');
    lines.push('Nookbag Diagnostics Report');
    lines.push(`Generated (browser local time): ${new Date().toISOString()}`);
    lines.push(`Page: ${window.location.href}`);
    lines.push('');

    lines.push('--- Browser / Connection ---');
    lines.push(`User agent: ${env.userAgent}`);
    lines.push(`Platform: ${env.platform}`);
    lines.push(`Language / Timezone: ${env.language} / ${env.timezone}`);
    lines.push(`Screen / Viewport: ${env.screen} / ${env.viewport}`);
    lines.push(`navigator.onLine: ${env.onLine}`);
    if (typeof env.networkInformationApi === 'string') {
      lines.push(`Network Information API: ${env.networkInformationApi}`);
    } else {
      const n = env.networkInformationApi;
      lines.push(
        `Network Information API: effectiveType=${n.effectiveType}, downlink=${n.downlinkMbps}Mbps, ` +
          `rtt=${n.rttMs}ms, saveData=${n.saveData}`
      );
    }
    lines.push('');

    lines.push('--- This Page Load Timing ---');
    if (t.available) {
      lines.push(`DNS / TCP / TLS: ${t.dnsMs}ms / ${t.tcpMs}ms / ${t.tlsMs}ms`);
      lines.push(`TTFB / Download / Total: ${t.ttfbMs}ms / ${t.downloadMs}ms / ${t.totalMs}ms`);
    } else {
      lines.push(`Navigation Timing: ${t.reason}`);
    }
    lines.push('');

    lines.push('--- Clock Skew (browser vs. this server) ---');
    lines.push(skew.available ? `Skew: ${skew.skewMs}ms (local - server)` : `Skew: ${skew.reason}`);
    lines.push('');

    lines.push(`--- Latency Probes (${SAMPLES_PER_TARGET} samples each, cache disabled) ---`);
    state.sameOriginResults.forEach((r) => lines.push(formatLatencyRow(r)));
    if (state.configuredTabResults.length > 0) {
      lines.push('');
      lines.push('  Configured services (from ui-config.yml tabs):');
      state.configuredTabResults.forEach((r) => lines.push(formatLatencyRow(r)));
    }
    lines.push('');
    lines.push('  Internet baseline (is it just my connection?):');
    state.internetResults.forEach((r) => lines.push(formatLatencyRow(r)));
    lines.push('');

    lines.push('--- Throughput (approximate, single stream) ---');
    lines.push(tp.available ? `~2MB download: ${tp.seconds}s -> ~${tp.approxMbps} Mbps` : `Throughput: ${tp.reason}`);
    lines.push('');

    lines.push('--- Automation API (/runner/api/diagnostics) ---');
    lines.push(`Round trip: ${sd.roundTripMs}ms`);
    if (sd.available) {
      const d = sd.data;
      lines.push(`Uptime: ${d.uptime_seconds}s`);
      lines.push(`CPU: ${formatCpu(d.cpu)}`);
      lines.push(`Memory: ${formatMemory(d.memory)}`);
      lines.push(
        `Load average: ${
          d.load_average && d.load_average.available
            ? `${d.load_average.load_1m}, ${d.load_average.load_5m}, ${d.load_average.load_15m}`
            : (d.load_average && d.load_average.reason) || 'not available'
        }`
      );
      lines.push(`Disk: ${formatDisk(d.disk)}`);
      lines.push(
        `Job queue: ${
          d.job_queue ? `${d.job_queue.active_jobs} active / ${d.job_queue.max_workers} workers` : 'not available'
        }`
      );
      lines.push(`K8s API reachability: ${formatReachability(d.k8s_api)}`);
      lines.push(`Bastion/VM reachability: ${formatReachability(d.bastion)}`);
    } else {
      lines.push(`Error: ${sd.reason}`);
    }
    lines.push('');

    lines.push('--- Known limitations ---');
    lines.push("This page cannot see cluster-wide node pressure, other tenants' noisy-neighbor");
    lines.push('load, or etcd/apiserver internals. If everything above looks clean but things');
    lines.push('still feel slow, check cluster monitoring (oc adm top nodes, Grafana) next.');
    lines.push('```');

    return lines.join('\n');
  }

  // ---------------------------------------------------------------------
  // Orchestration
  // ---------------------------------------------------------------------

  /**
   * Every individual check function above already catches its own errors
   * and resolves to an {available: false, ...} shape rather than rejecting.
   * Promise.allSettled (rather than Promise.all) is still used here as a
   * defense-in-depth belt-and-suspenders measure: if a future change to one
   * of those functions ever lets a rejection slip through, one broken check
   * still can't take down the whole report.
   */
  async function settleAll(promises, fallback) {
    const results = await Promise.allSettled(promises);
    return results.map((r) => (r.status === 'fulfilled' ? r.value : fallback));
  }

  async function runDiagnostics() {
    setRunning(true);
    setStatus('Running diagnostics…');

    const environment = getEnvironmentInfo();
    const pageLoadTiming = getPageLoadTiming();

    try {
      const [clockSkew, tabTargets] = await Promise.all([getClockSkew(), getConfiguredTabTargets()]);

      const [sameOriginResults, configuredTabResults, internetResults, throughput, serverDiagnostics] =
        await Promise.all([
          settleAll(
            SAME_ORIGIN_TARGETS.map((t) => repeatedProbe(t.label, t.url, t.mode)),
            { available: false, failures: SAMPLES_PER_TARGET, samples: SAMPLES_PER_TARGET }
          ),
          settleAll(
            tabTargets.map((t) => repeatedProbe(t.label, t.url, t.mode)),
            { available: false, failures: SAMPLES_PER_TARGET, samples: SAMPLES_PER_TARGET }
          ),
          settleAll(
            INTERNET_BASELINE_TARGETS.map((t) => repeatedProbe(t.label, t.url, t.mode)),
            { available: false, failures: SAMPLES_PER_TARGET, samples: SAMPLES_PER_TARGET }
          ),
          getThroughputSample(),
          getServerDiagnostics(),
        ]);

      const report = buildReport({
        environment,
        pageLoadTiming,
        clockSkew,
        sameOriginResults,
        configuredTabResults,
        internetResults,
        throughput,
        serverDiagnostics,
      });
      reportEl.textContent = report;
      reportEl.dataset.hasReport = 'true';
      setStatus('Done. Click "Copy All" to copy the report.');
    } catch (err) {
      setStatus(`Diagnostics failed unexpectedly: ${err}`);
    } finally {
      setRunning(false);
    }
  }

  // ---------------------------------------------------------------------
  // Copy All
  // ---------------------------------------------------------------------

  function legacyCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (_err) {
      ok = false;
    }
    document.body.removeChild(textarea);
    return ok;
  }

  async function copyReport() {
    const text = reportEl.textContent || '';
    if (!text) return;

    // navigator.clipboard is undefined in any non-secure (plain HTTP)
    // context, not just old browsers -- some showroom deployments may be
    // reached over HTTP, so the legacy execCommand fallback below is load
    // bearing, not just a courtesy for old browsers.
    if (window.navigator.clipboard && window.navigator.clipboard.writeText) {
      try {
        await window.navigator.clipboard.writeText(text);
        setStatus('Copied to clipboard.');
        return;
      } catch (_err) {
        // Fall through to the legacy fallback below.
      }
    }

    const ok = legacyCopy(text);
    setStatus(ok ? 'Copied to clipboard.' : 'Could not copy automatically -- select the text above and copy manually.');
  }

  // ---------------------------------------------------------------------
  // Wire up + auto-run once on load
  // ---------------------------------------------------------------------

  runBtn.addEventListener('click', () => { runDiagnostics(); });
  copyBtn.addEventListener('click', () => { copyReport(); });

  runDiagnostics();
})();
