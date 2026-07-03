import { describe, expect, it } from 'vitest';
import { applyOptions } from '../../../../../src/platform/ui-base/lifecycle/apply-options.utils.js';

describe('applyOptions', () => {
  it('assigns default values for fields omitted from options', () => {
    const instance: Record<string, unknown> = {};

    applyOptions(instance, { debounceMs: 100, label: 'default' }, {});

    expect(instance.debounceMs).toBe(100);
    expect(instance.label).toBe('default');
  });

  it('lets explicit option values override defaults', () => {
    const instance: Record<string, unknown> = {};

    applyOptions(instance, { debounceMs: 100 }, { debounceMs: 250 });

    expect(instance.debounceMs).toBe(250);
  });

  it('treats an explicit undefined option value as omitted, falling back to the default', () => {
    const instance: Record<string, unknown> = {};

    applyOptions(instance, { debounceMs: 100 }, { debounceMs: undefined });

    expect(instance.debounceMs).toBe(100);
  });

  it('does not treat null as omitted -- null overrides a non-null default', () => {
    const instance: Record<string, unknown> = {};

    applyOptions(instance, { logger: 'default-logger' }, { logger: null });

    expect(instance.logger).toBeNull();
  });

  it('assigns option-only fields that have no corresponding default', () => {
    const instance: Record<string, unknown> = {};

    applyOptions(instance, {}, { triggerElement: 'element' });

    expect(instance.triggerElement).toBe('element');
  });

  it('assigns resolved fields as own enumerable properties for white-box access', () => {
    const instance: Record<string, unknown> = {};

    applyOptions(instance, { visible: false }, {});

    expect(Object.prototype.hasOwnProperty.call(instance, 'visible')).toBe(true);
    expect(Object.keys(instance)).toContain('visible');
  });

  it('does not mutate the defaults or options arguments', () => {
    interface DebounceOptions { debounceMs: number; }

    const defaults = Object.freeze({ debounceMs: 100 });
    const options = Object.freeze({ debounceMs: 250 });
    const instance: Record<string, unknown> = {};

    applyOptions<DebounceOptions>(instance, defaults, options);

    expect(defaults.debounceMs).toBe(100);
    expect(options.debounceMs).toBe(250);
  });

  it('merges disjoint default and option keys without dropping either', () => {
    interface DisjointOptions { onlyInDefaults?: string; onlyInOptions?: string; }

    const instance: Record<string, unknown> = {};

    applyOptions<DisjointOptions>(instance, { onlyInDefaults: 'a' }, { onlyInOptions: 'b' });

    expect(instance.onlyInDefaults).toBe('a');
    expect(instance.onlyInOptions).toBe('b');
  });

  it('overwrites pre-existing instance fields not present in either defaults or options', () => {
    const instance: Record<string, unknown> = { stale: 'leftover' };

    applyOptions(instance, {}, {});

    expect(instance.stale).toBe('leftover');
  });

  describe('typing', () => {
    interface WidgetOptions {
      label: string;
      debounceMs?: number;
      onSelect?: ((value: string) => void) | null;
    }

    it('accepts a defaults object narrower than the full options shape', () => {
      const instance: Partial<WidgetOptions> = {};

      applyOptions<WidgetOptions>(instance, { debounceMs: 100 }, { label: 'x' });

      expect(instance.label).toBe('x');
      expect(instance.debounceMs).toBe(100);
    });

    it('rejects options that do not satisfy the declared shape', () => {
      const instance: Partial<WidgetOptions> = {};

      // @ts-expect-error label must be a string, not a number
      applyOptions<WidgetOptions>(instance, {}, { label: 42 });

      expect(instance).toBeDefined();
    });
  });
});
