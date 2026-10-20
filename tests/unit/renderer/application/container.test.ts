import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  createRendererContainer,
  initializeContainer
} from '@renderer/application/container';
import type { ServiceIdentifier } from 'inversify';
import { TOKENS, TOKEN_KEYS } from '@renderer/application/di/tokens';
import { applyBindingOverrides } from '../../../support/di/binding-overrides';

const RESOLVABLE_TOKEN_KEYS = TOKEN_KEYS.filter((key) => key !== 'uiController');

/**
 * A handful of decorated classes take `@inject(TOKENS.uiController)`, which
 * bootstrap only binds after the UI shell renders — never before resolving
 * them. Tests that exercise the full graph stand in a stub, matching real
 * bootstrap order instead of resolving those classes out of order.
 */
function createFakeUiController(): unknown {
  return { initializeComponents: vi.fn(), dispose: vi.fn() };
}

describe('Renderer container', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('resolves every token once uiController is bound, matching bootstrap order', () => {
    const container = applyBindingOverrides(createRendererContainer(), TOKENS, { uiController: createFakeUiController() });

    for (const key of RESOLVABLE_TOKEN_KEYS) {
      expect(() => container.get(TOKENS[key] as ServiceIdentifier)).not.toThrow();
    }
  });

  it('returns the same singleton instance for every token across repeated resolutions', () => {
    const container = applyBindingOverrides(createRendererContainer(), TOKENS, { uiController: createFakeUiController() });

    for (const key of RESOLVABLE_TOKEN_KEYS) {
      const token = TOKENS[key] as ServiceIdentifier;
      expect(container.get(token), key).toBe(container.get(token));
    }
  });

  it('replaces an already-bound token with an override', () => {
    const fakeLoggerFactory = { create: vi.fn() };
    const container = applyBindingOverrides(createRendererContainer(), TOKENS, { loggerFactory: fakeLoggerFactory });

    expect(container.get(TOKENS.loggerFactory)).toBe(fakeLoggerFactory);
  });

  it('binds an override for a token with no default binding', () => {
    const fakeUiController = { initializeComponents: vi.fn(), dispose: vi.fn() };
    const container = applyBindingOverrides(createRendererContainer(), TOKENS, { uiController: fakeUiController });

    expect(container.get(TOKENS.uiController)).toBe(fakeUiController);
  });

  it('does not bind uiController by default', () => {
    const container = createRendererContainer();

    expect(container.isBound(TOKENS.uiController)).toBe(false);
  });

  it('resolves streamingRenderService before canvasLifecycleService without a circular error', () => {
    const container = applyBindingOverrides(createRendererContainer(), TOKENS, { uiController: createFakeUiController() });

    expect(() => container.get(TOKENS.streamingRenderService)).not.toThrow();
    expect(() => container.get(TOKENS.canvasLifecycleService)).not.toThrow();
  });

  it('resolves canvasLifecycleService before streamingRenderService without a circular error', () => {
    const container = applyBindingOverrides(createRendererContainer(), TOKENS, { uiController: createFakeUiController() });

    expect(() => container.get(TOKENS.canvasLifecycleService)).not.toThrow();
    expect(() => container.get(TOKENS.streamingRenderService)).not.toThrow();
  });

  it('warns and reuses container on repeated initialization', () => {
    const warnSpy = vi.spyOn(console, 'warn');
    const first = initializeContainer();
    const second = initializeContainer();

    expect(first).toBe(second);
    expect(warnSpy).toHaveBeenCalledWith('Container already initialized');
  });
});
