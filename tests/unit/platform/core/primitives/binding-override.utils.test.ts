import { describe, expect, it, vi } from 'vitest';
import { applyBindingOverrides, type BindingOverrideContainer } from '@platform/core';

const TOKENS = { alpha: Symbol('alpha'), beta: Symbol('beta') } as const;

function createContainerSpy(bound: unknown[] = []) {
  const boundSet = new Set(bound);
  const toConstantValue = vi.fn();
  const unbind = vi.fn();
  const bind = vi.fn(() => ({ toConstantValue }));
  const container: BindingOverrideContainer = {
    isBound: (token) => boundSet.has(token),
    unbind,
    bind
  };
  return { container, bind, unbind, toConstantValue };
}

describe('applyBindingOverrides', () => {
  it('unbinds an already-bound token before binding the constant', () => {
    const { container, bind, unbind, toConstantValue } = createContainerSpy([TOKENS.alpha]);
    applyBindingOverrides(container, TOKENS, { alpha: 'stub' });
    expect(unbind).toHaveBeenCalledWith(TOKENS.alpha);
    expect(bind).toHaveBeenCalledWith(TOKENS.alpha);
    expect(toConstantValue).toHaveBeenCalledWith('stub');
  });

  it('binds an unbound token without unbinding', () => {
    const { container, bind, unbind, toConstantValue } = createContainerSpy();
    applyBindingOverrides(container, TOKENS, { beta: 42 });
    expect(unbind).not.toHaveBeenCalled();
    expect(bind).toHaveBeenCalledWith(TOKENS.beta);
    expect(toConstantValue).toHaveBeenCalledWith(42);
  });

  it('does nothing for an empty overrides map', () => {
    const { container, bind, unbind } = createContainerSpy([TOKENS.alpha]);
    applyBindingOverrides(container, TOKENS, {});
    expect(unbind).not.toHaveBeenCalled();
    expect(bind).not.toHaveBeenCalled();
  });
});
