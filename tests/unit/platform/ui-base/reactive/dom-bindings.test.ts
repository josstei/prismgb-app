import { describe, it, expect } from 'vitest';
import { signal, bindText, bindClass, bindAttr, bindStyleProperty } from '@platform/ui-base/reactive';

describe('dom-bindings', () => {
  it('bindText updates textContent synchronously on signal write', () => {
    const el = document.createElement('span');
    const s = signal('a');
    const dispose = bindText(el, s);
    expect(el.textContent).toBe('a'); // eager run
    s.value = 'b';
    expect(el.textContent).toBe('b'); // synchronous, no flush
    dispose();
    s.value = 'c';
    expect(el.textContent).toBe('b'); // torn down
  });

  it('bindClass toggles correctly', () => {
    const el = document.createElement('div');
    const on = signal(false);
    bindClass(el, 'active', on);
    expect(el.classList.contains('active')).toBe(false);
    on.value = true;
    expect(el.classList.contains('active')).toBe(true);
  });

  it('bindAttr sets and removes', () => {
    const el = document.createElement('div');
    const v = signal<string | null>('x');
    bindAttr(el, 'data-k', v);
    expect(el.getAttribute('data-k')).toBe('x');
    v.value = null;
    expect(el.hasAttribute('data-k')).toBe(false);
  });

  it('bindStyleProperty sets a CSS custom property and tears down', () => {
    const el = document.createElement('div');
    const progress = signal('0');
    const dispose = bindStyleProperty(el, '--progress', progress);
    expect(el.style.getPropertyValue('--progress')).toBe('0');
    progress.value = '42';
    expect(el.style.getPropertyValue('--progress')).toBe('42');
    dispose();
    progress.value = '100';
    expect(el.style.getPropertyValue('--progress')).toBe('42');
  });

  it('null element is a no-op', () => {
    const dispose = bindText(null, signal('a'));
    expect(typeof dispose).toBe('function');
    dispose();
  });
});
