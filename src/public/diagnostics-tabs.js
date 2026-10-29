/**
 * Tab-config parsing/URL-construction helpers for the diagnostics page's
 * "configured services" probe list.
 *
 * Extracted out of diagnostics.js into its own file so this logic -- the
 * trickiest, most bug-prone part of the diagnostics page (a minimal,
 * regex-based `tabs:` extractor, deliberately NOT a general YAML parser) --
 * can be unit tested directly instead of only indirectly through the page.
 *
 * Still plain, dependency-free, dual CommonJS/browser-global JS (no ES
 * import/export syntax, no build step): loaded via a classic <script> tag
 * on diagnostics.html (exposed as `window.DiagnosticsTabs`) and via
 * require()/import from Vitest for direct unit testing. See
 * src/public/diagnostics.js's file-level comment for why this whole area
 * avoids a build step.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DiagnosticsTabs = api;
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null, function () {
  'use strict';

  function stripQuotes(s) {
    return s.replace(/^['"]|['"]$/g, '');
  }

  // Mirrors the `type:` preset switch in src/app.tsx's createUrlsFromVars()
  // -- see docs/UI-CONFIG.md's "Terminal presets via type" section. Preset
  // values win over any explicitly provided port/path, same as app.tsx.
  const TYPE_PRESETS = {
    'double-terminal': { port: '443', path: '/tty-top', secondary_port: '443', secondary_path: '/tty-bottom' },
    terminal: { port: '443', path: '/tty1' },
    'secondary-terminal': { port: '443', path: '/tty2' },
    codeserver: { port: '8443', path: '/' },
    parasol: { port: '8005', path: '/' },
  };

  function applyTypePreset(tab) {
    const preset = tab.type ? TYPE_PRESETS[tab.type] : null;
    return preset ? Object.assign({}, tab, preset) : tab;
  }

  /**
   * Deliberately minimal, NOT a general YAML parser: extracts only the
   * small, flat `tabs:` list shape nookbag's own config schema actually
   * uses (see docs/UI-CONFIG.md / src/config-schema.ts) -- list items with
   * plain `name:`/`url:`/`port:`/`path:`/`external:`/`type:` fields in any
   * order (YAML mapping key order is never significant), no nested
   * mappings. `type:` presets (terminal/codeserver/parasol/etc.) are
   * expanded via applyTypePreset() so tabs that only specify `type:` (no
   * explicit port/path) are still probeable. Any config that doesn't match
   * this shape just yields fewer probe targets; it never throws (callers
   * still wrap this defensively).
   */
  function parseConfiguredTabs(yamlText) {
    const lines = yamlText.split(/\r?\n/);
    const tabs = [];
    let inTabs = false;
    let current = null;

    function flush() {
      if (!current) return;
      const resolved = applyTypePreset(current);
      if (resolved.url || (resolved.port && resolved.path)) {
        tabs.push(resolved);
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

      // A new list item starts at `- <rest>`. The recognized fields
      // (name/url/port/path/external/type) can appear in any order within
      // an item -- YAML mapping key order is never significant -- so item
      // boundaries are detected purely from the leading `-`, not from
      // `name:` specifically appearing first.
      const itemStart = /^-\s*(.*)$/.exec(trimmed);
      if (itemStart) {
        flush();
        current = {};
        if (itemStart[1]) applyField(current, itemStart[1]);
        continue;
      }

      if (!current) continue;

      applyField(current, trimmed);
    }
    flush();
    return tabs;
  }

  function applyField(current, text) {
    const fieldMatch = /^(name|url|port|path|external|type)\s*:\s*(.+)$/.exec(text);
    if (!fieldMatch) return;
    const [, key, rawValue] = fieldMatch;
    const value = stripQuotes(rawValue.trim());
    current[key] = key === 'external' ? value === 'true' : value;
  }

  function tabProbeUrl(tab, loc) {
    const location = loc || (typeof window !== 'undefined' ? window.location : { protocol: 'http:', hostname: 'localhost' });
    if (tab.url) return tab.url;
    if (tab.port && tab.path) {
      return `${location.protocol}//${location.hostname}:${tab.port}${tab.path}`;
    }
    return null;
  }

  return { stripQuotes, parseConfiguredTabs, tabProbeUrl };
});
