import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { formatYamlError } from './utils';

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
    // Location line should mention a concrete line/column (line numbers may vary by parser),
    // so just assert it includes the prefix and a number.
    expect(out).toMatch(/Location: line \d+, column \d+/);
    // Reason should include duplicated mapping key
    expect(out).toMatch(/Reason: .*duplicated mapping key/i);
    // Code frame contains the second tabs occurrence and caret
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
