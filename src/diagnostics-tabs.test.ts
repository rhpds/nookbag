import { describe, it, expect } from 'vitest';
import { parseConfiguredTabs, tabProbeUrl, stripQuotes } from './public/diagnostics-tabs.js';

const LOC = { protocol: 'https:', hostname: 'lab-example.com' };

describe('stripQuotes', () => {
  it('strips matching single quotes', () => {
    expect(stripQuotes("'hello'")).toBe('hello');
  });

  it('strips matching double quotes', () => {
    expect(stripQuotes('"hello"')).toBe('hello');
  });

  it('leaves unquoted strings untouched', () => {
    expect(stripQuotes('hello')).toBe('hello');
  });
});

describe('parseConfiguredTabs', () => {
  it('parses a tab with an explicit url', () => {
    const yaml = ['tabs:', '  - name: Console', '    url: https://console.example.com/', '    external: true'].join(
      '\n'
    );
    expect(parseConfiguredTabs(yaml)).toEqual([
      { name: 'Console', url: 'https://console.example.com/', external: true },
    ]);
  });

  it('parses a tab defined via port + path (no explicit url)', () => {
    const yaml = ['tabs:', '  - name: App', '    port: 3000', '    path: /app'].join('\n');
    expect(parseConfiguredTabs(yaml)).toEqual([{ name: 'App', port: '3000', path: '/app' }]);
  });

  it('parses multiple tabs', () => {
    const yaml = [
      'tabs:',
      '  - name: One',
      '    url: https://one.example.com/',
      '  - name: Two',
      '    url: https://two.example.com/',
    ].join('\n');
    expect(parseConfiguredTabs(yaml)).toEqual([
      { name: 'One', url: 'https://one.example.com/' },
      { name: 'Two', url: 'https://two.example.com/' },
    ]);
  });

  it('strips quotes from field values', () => {
    const yaml = ['tabs:', "  - name: 'Quoted Name'", '    url: "https://example.com/"'].join('\n');
    expect(parseConfiguredTabs(yaml)).toEqual([{ name: 'Quoted Name', url: 'https://example.com/' }]);
  });

  it('ignores comments and blank lines', () => {
    const yaml = ['# top-level comment', 'tabs:', '  # a tab', '  - name: One', '', '    url: https://one.example.com/'].join(
      '\n'
    );
    expect(parseConfiguredTabs(yaml)).toEqual([{ name: 'One', url: 'https://one.example.com/' }]);
  });

  it('drops a tab with neither url nor port+path', () => {
    const yaml = ['tabs:', '  - name: Incomplete', '    external: true'].join('\n');
    expect(parseConfiguredTabs(yaml)).toEqual([]);
  });

  it('stops collecting fields once a new top-level key begins', () => {
    const yaml = ['tabs:', '  - name: One', '    url: https://one.example.com/', 'other_key: value'].join('\n');
    expect(parseConfiguredTabs(yaml)).toEqual([{ name: 'One', url: 'https://one.example.com/' }]);
  });

  it('returns an empty array for yaml with no tabs section', () => {
    const yaml = ['type: showroom', 'default_width: 30'].join('\n');
    expect(parseConfiguredTabs(yaml)).toEqual([]);
  });

  it('returns an empty array for an empty string', () => {
    expect(parseConfiguredTabs('')).toEqual([]);
  });

  describe('type: presets', () => {
    // Mirrors src/app.tsx's createUrlsFromVars() switch on vars.type --
    // see docs/UI-CONFIG.md's "Terminal presets via type" section. A tab
    // declared with only `type:` (the documented shorthand, no explicit
    // port/path) must still resolve to a probeable port+path pair;
    // otherwise it's silently invisible to the diagnostics page.
    it.each([
      ['terminal', { port: '443', path: '/tty1' }],
      ['secondary-terminal', { port: '443', path: '/tty2' }],
      ['codeserver', { port: '8443', path: '/' }],
      ['parasol', { port: '8005', path: '/' }],
    ])('resolves type: %s to port+path', (type, expected) => {
      const yaml = ['tabs:', '  - name: Terminal', `    type: ${type}`].join('\n');
      const [tab] = parseConfiguredTabs(yaml);
      expect(tab).toMatchObject(expected);
    });

    it('resolves double-terminal to primary and secondary port+path', () => {
      const yaml = ['tabs:', '  - name: Double Terminal', '    type: double-terminal'].join('\n');
      const [tab] = parseConfiguredTabs(yaml);
      expect(tab).toMatchObject({
        port: '443',
        path: '/tty-top',
        secondary_port: '443',
        secondary_path: '/tty-bottom',
      });
    });

    it('lets a type preset win over an explicitly provided port/path, matching app.tsx', () => {
      const yaml = ['tabs:', '  - name: Terminal', '    type: terminal', '    port: 9999', '    path: /custom'].join(
        '\n'
      );
      const [tab] = parseConfiguredTabs(yaml);
      expect(tab).toMatchObject({ port: '443', path: '/tty1' });
    });
  });

  describe('field order independence', () => {
    // YAML mapping key order is never semantically significant, so a tabs[]
    // item is just as valid with `url:`/`port:` listed before `name:`.
    it('recognizes a tab whose first field is url, not name', () => {
      const yaml = ['tabs:', '  - url: https://console.example.com/', '    name: Console'].join('\n');
      expect(parseConfiguredTabs(yaml)).toEqual([{ url: 'https://console.example.com/', name: 'Console' }]);
    });

    it('recognizes a tab whose first field is port, not name', () => {
      const yaml = ['tabs:', '  - port: 3000', '    path: /app', '    name: App'].join('\n');
      expect(parseConfiguredTabs(yaml)).toEqual([{ port: '3000', path: '/app', name: 'App' }]);
    });

    it('still separates two name-less-first tabs into distinct entries', () => {
      const yaml = [
        'tabs:',
        '  - url: https://one.example.com/',
        '    name: One',
        '  - url: https://two.example.com/',
        '    name: Two',
      ].join('\n');
      expect(parseConfiguredTabs(yaml)).toEqual([
        { url: 'https://one.example.com/', name: 'One' },
        { url: 'https://two.example.com/', name: 'Two' },
      ]);
    });
  });
});

describe('tabProbeUrl', () => {
  it('prefers an explicit url over port/path', () => {
    const tab = { name: 'Console', url: 'https://console.example.com/', port: '1234', path: '/ignored' };
    expect(tabProbeUrl(tab, LOC)).toBe('https://console.example.com/');
  });

  it('constructs a url from port + path using the given location', () => {
    const tab = { name: 'App', port: '3000', path: '/app' };
    expect(tabProbeUrl(tab, LOC)).toBe('https://lab-example.com:3000/app');
  });

  it('returns null when neither url nor port+path is present', () => {
    expect(tabProbeUrl({ name: 'Nothing' }, LOC)).toBeNull();
  });

  it('returns null when only port is present without path', () => {
    expect(tabProbeUrl({ name: 'OnlyPort', port: '3000' }, LOC)).toBeNull();
  });
});
