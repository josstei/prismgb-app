import { describe, it, expect, vi } from 'vitest';
import { signal, computed, effect, batch, untracked } from '../../../src/reactive/signal.js';

describe('signal primitive', () => {
  it('runs effects eagerly and re-runs synchronously on each change', () => {
    const count = signal(0);
    const seen: number[] = [];
    const dispose = effect(() => seen.push(count.value));
    expect(seen).toEqual([0]);
    count.value = 1;
    count.value = 2;
    expect(seen).toEqual([0, 1, 2]);
    dispose();
  });

  it('skips no-op (Object.is) writes', () => {
    const s = signal(1);
    const fn = vi.fn(() => s.value);
    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    s.value = 1;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('peek() and untracked() read without subscribing', () => {
    const s = signal(0);
    const fn = vi.fn(() => {
      s.peek();
      untracked(() => s.value);
    });
    effect(fn);
    s.value = 5;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('computed derives and recomputes when an input changes', () => {
    const a = signal(2);
    const b = signal(3);
    const sum = computed(() => a.value + b.value);
    expect(sum.value).toBe(5);
    a.value = 10;
    expect(sum.value).toBe(13);
  });

  it('diamond: a single source change yields the correct derived value', () => {
    const d = signal(1);
    const b = computed(() => d.value + 1);
    const c = computed(() => d.value * 2);
    const a = computed(() => b.value + c.value);
    expect(a.value).toBe(4);
    d.value = 5;
    expect(a.value).toBe(16);
  });

  it('cleans up stale dependencies (dynamic deps)', () => {
    const useX = signal(true);
    const x = signal('x');
    const y = signal('y');
    const fn = vi.fn(() => (useX.value ? x.value : y.value));
    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    useX.value = false;
    expect(fn).toHaveBeenCalledTimes(2);
    x.value = 'x2';
    expect(fn).toHaveBeenCalledTimes(2);
    y.value = 'y2';
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('batch() coalesces multiple writes into one flush per effect', () => {
    const a = signal(0);
    const b = signal(0);
    const fn = vi.fn(() => a.value + b.value);
    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    batch(() => {
      a.value = 1;
      b.value = 2;
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('dispose() stops re-runs and detaches the effect', () => {
    const s = signal(0);
    const fn = vi.fn(() => s.value);
    const dispose = effect(fn);
    s.value = 1;
    expect(fn).toHaveBeenCalledTimes(2);
    dispose();
    s.value = 2;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not infinitely cascade when an effect writes a different signal', () => {
    const src = signal(0);
    const out = signal(0);
    effect(() => {
      out.value = src.value * 2;
    });
    src.value = 4;
    expect(out.value).toBe(8);
  });
});
