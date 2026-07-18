import { describe, it, expect, vi } from 'vitest';
import { signal, computed, effect } from '@platform/ui-base/reactive';

describe('reactive facade (@preact/signals-core)', () => {
  it('runs effects immediately and re-runs synchronously on each change', () => {
    const count = signal(0);
    const seen: number[] = [];
    const dispose = effect(() => {
      seen.push(count.value);
    });
    expect(seen).toEqual([0]);
    count.value = 1;
    count.value = 2;
    expect(seen).toEqual([0, 1, 2]);
    dispose();
  });

  it('skips writes of an identical value', () => {
    const s = signal(1);
    const fn = vi.fn(() => {
      s.value;
    });
    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    s.value = 1;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('peek() reads without subscribing', () => {
    const s = signal(0);
    const fn = vi.fn(() => {
      s.peek();
    });
    effect(fn);
    s.value = 5;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('computed derives lazily and recomputes when an input changes', () => {
    const a = signal(2);
    const b = signal(3);
    const compute = vi.fn(() => a.value + b.value);
    const sum = computed(compute);
    expect(compute).not.toHaveBeenCalled();
    expect(sum.value).toBe(5);
    a.value = 10;
    expect(sum.value).toBe(13);
  });

  it('diamond: a single source change re-runs a dependent effect once, glitch-free', () => {
    const d = signal(1);
    const b = computed(() => d.value + 1);
    const c = computed(() => d.value * 2);
    const a = computed(() => b.value + c.value);
    const seen: number[] = [];
    effect(() => {
      seen.push(a.value);
    });
    expect(seen).toEqual([4]);
    d.value = 5;
    expect(seen).toEqual([4, 16]);
  });

  it('cleans up stale dependencies (dynamic deps)', () => {
    const useX = signal(true);
    const x = signal('x');
    const y = signal('y');
    const fn = vi.fn(() => {
      void (useX.value ? x.value : y.value);
    });
    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    useX.value = false;
    expect(fn).toHaveBeenCalledTimes(2);
    x.value = 'x2';
    expect(fn).toHaveBeenCalledTimes(2);
    y.value = 'y2';
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('dispose() stops re-runs and detaches the effect', () => {
    const s = signal(0);
    const fn = vi.fn(() => {
      s.value;
    });
    const dispose = effect(fn);
    s.value = 1;
    expect(fn).toHaveBeenCalledTimes(2);
    dispose();
    s.value = 2;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('allows an effect to write a different signal without cascading', () => {
    const src = signal(0);
    const out = signal(0);
    effect(() => {
      out.value = src.value * 2;
    });
    src.value = 4;
    expect(out.value).toBe(8);
  });
});
