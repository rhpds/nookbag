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
