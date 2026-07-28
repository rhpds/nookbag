import { describe, it, expect } from 'vitest';
import * as v from 'valibot';
import { ConfigSchema, TabSchema, ModuleSchema, ViewModeSchema } from './config-schema';

describe('ConfigSchema', () => {
  it('accepts valid minimal config with just type', () => {
    const result = v.safeParse(ConfigSchema, { type: 'guided' });
    expect(result.success).toBe(true);
  });

  it('accepts all valid type values', () => {
    for (const type of ['open', 'guided', 'showroom', 'zerotouch', 'zero-touch']) {
      const result = v.safeParse(ConfigSchema, { type });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid type value', () => {
    const result = v.safeParse(ConfigSchema, { type: 'invalid-type' });
    expect(result.success).toBe(false);
  });

  it('accepts config with all optional fields', () => {
    const fullConfig = {
      type: 'guided',
      antora: {
        modules: [{ name: 'module-01', scripts: ['setup', 'validation', 'solve'], label: 'First Module' }],
        name: 'test-lab',
        dir: './docs',
        version: '1.0',
      },
      tabs: [{ name: 'Terminal', port: '8080', path: '/wetty' }],
      default_width: 50,
      skipModuleEnabled: true,
      persist_url_state: true,
      persistUrlState: true,
      view_switcher: { enabled: true, default_mode: 'split' },
    };
    const result = v.safeParse(ConfigSchema, fullConfig);
    expect(result.success).toBe(true);
  });

  it('accepts extra unknown keys (looseObject)', () => {
    const result = v.safeParse(ConfigSchema, { type: 'open', custom_field: 'value', another: 42 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.output as Record<string, unknown>).custom_field).toBe('value');
    }
  });

  it('accepts empty object (all fields optional)', () => {
    const result = v.safeParse(ConfigSchema, {});
    expect(result.success).toBe(true);
  });

  it('accepts view_switcher as boolean', () => {
    const result = v.safeParse(ConfigSchema, { view_switcher: true });
    expect(result.success).toBe(true);
  });

  it('accepts view_switcher as object with default_mode', () => {
    const result = v.safeParse(ConfigSchema, { view_switcher: { enabled: true, default_mode: 'tabs' } });
    expect(result.success).toBe(true);
  });

  it('rejects view_switcher with invalid default_mode', () => {
    const result = v.safeParse(ConfigSchema, { view_switcher: { default_mode: 'invalid' } });
    expect(result.success).toBe(false);
  });
});

describe('TabSchema', () => {
  it('accepts minimal tab with just name', () => {
    const result = v.safeParse(TabSchema, { name: 'Terminal' });
    expect(result.success).toBe(true);
  });

  it('coerces port number to string', () => {
    const result = v.safeParse(TabSchema, { name: 'Terminal', port: 8080 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.port).toBe('8080');
    }
  });

  it('accepts port as string', () => {
    const result = v.safeParse(TabSchema, { name: 'Terminal', port: '3000' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.port).toBe('3000');
    }
  });

  it('accepts all valid tab types', () => {
    for (const type of ['double-terminal', 'terminal', 'secondary-terminal', 'codeserver', 'parasol']) {
      const result = v.safeParse(TabSchema, { name: 'Tab', type });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid tab type', () => {
    const result = v.safeParse(TabSchema, { name: 'Tab', type: 'invalid-tab-type' });
    expect(result.success).toBe(false);
  });

  it('accepts tab with modules array', () => {
    const result = v.safeParse(TabSchema, { name: 'Editor', modules: ['module-01', 'module-02'] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.modules).toEqual(['module-01', 'module-02']);
    }
  });

  it('accepts tab with secondary fields', () => {
    const result = v.safeParse(TabSchema, {
      name: 'Split',
      port: '8080',
      path: '/console',
      secondary_name: 'Logs',
      secondary_port: '8081',
      secondary_path: '/logs',
    });
    expect(result.success).toBe(true);
  });

  it('accepts tab with external URL', () => {
    const result = v.safeParse(TabSchema, { name: 'Docs', url: 'https://docs.example.com', external: true });
    expect(result.success).toBe(true);
  });
});

describe('ModuleSchema', () => {
  it('accepts module with just name', () => {
    const result = v.safeParse(ModuleSchema, { name: 'module-01' });
    expect(result.success).toBe(true);
  });

  it('accepts valid scripts values', () => {
    const result = v.safeParse(ModuleSchema, { name: 'mod', scripts: ['setup', 'validation', 'solve'] });
    expect(result.success).toBe(true);
  });

  it('rejects invalid scripts value', () => {
    const result = v.safeParse(ModuleSchema, { name: 'mod', scripts: ['setup', 'invalid'] });
    expect(result.success).toBe(false);
  });

  it('accepts module with label and solveButton', () => {
    const result = v.safeParse(ModuleSchema, { name: 'mod', label: 'My Module', solveButton: true });
    expect(result.success).toBe(true);
  });
});

describe('ViewModeSchema', () => {
  it('accepts valid modes', () => {
    for (const mode of ['instructions', 'split', 'tabs']) {
      const result = v.safeParse(ViewModeSchema, mode);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid mode', () => {
    const result = v.safeParse(ViewModeSchema, 'fullscreen');
    expect(result.success).toBe(false);
  });
});
