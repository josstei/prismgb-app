import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  createRendererContainer,
  initializeContainer
} from '@renderer/application/container';
import type { ServiceIdentifier } from 'inversify';
import { TOKENS, TOKEN_KEYS } from '@renderer/application/di/tokens.js';

describe('Renderer container', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('resolves every token', () => {
    const container = createRendererContainer();

    for (const key of TOKEN_KEYS) {
      expect(() => container.get(TOKENS[key] as ServiceIdentifier)).not.toThrow();
    }
  });

  it('returns the same singleton instance across repeated resolutions', () => {
    const container = createRendererContainer();

    expect(container.get(TOKENS.appState)).toBe(container.get(TOKENS.appState));
  });

  it('replaces an already-bound token with an override', () => {
    const fakeLoggerFactory = { create: vi.fn() };
    const container = createRendererContainer({ loggerFactory: fakeLoggerFactory });

    expect(container.get(TOKENS.loggerFactory)).toBe(fakeLoggerFactory);
  });

  it('resolves streamingRenderService before canvasLifecycleService without a circular error', () => {
    const container = createRendererContainer();

    expect(() => container.get(TOKENS.streamingRenderService)).not.toThrow();
    expect(() => container.get(TOKENS.canvasLifecycleService)).not.toThrow();
  });

  it('resolves canvasLifecycleService before streamingRenderService without a circular error', () => {
    const container = createRendererContainer();

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
