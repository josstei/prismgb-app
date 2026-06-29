import { describe, it, expect } from 'vitest';
import { signal } from '../../../src/reactive/signal.js';
import { bindText, bindClass, bindVisible, bindAttr } from '../../../src/reactive/dom-bindings.js';

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

  it('bindClass / bindVisible toggle correctly', () => {
    const el = document.createElement('div');
    const on = signal(false);
    bindClass(el, 'active', on);
    expect(el.classList.contains('active')).toBe(false);
    on.value = true;
    expect(el.classList.contains('active')).toBe(true);

    const visible = signal(true);
    bindVisible(el, visible, 'hidden');
    expect(el.classList.contains('hidden')).toBe(false);
    visible.value = false;
    expect(el.classList.contains('hidden')).toBe(true);
  });

  it('bindAttr sets and removes', () => {
    const el = document.createElement('div');
    const v = signal<string | null>('x');
    bindAttr(el, 'data-k', v);
    expect(el.getAttribute('data-k')).toBe('x');
    v.value = null;
    expect(el.hasAttribute('data-k')).toBe(false);
  });

  it('null element is a no-op', () => {
    const dispose = bindText(null, signal('a'));
    expect(typeof dispose).toBe('function');
    dispose();
  });
});
