import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  createRendererContainer,
  initializeContainer
} from '@renderer/application/container';
import type { ServiceIdentifier } from 'inversify';
import { TOKENS, TOKEN_KEYS } from '@renderer/application/di/tokens';
import { applyBindingOverrides } from '../../../support/di/binding-overrides';

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

  it('returns the same singleton instance for every token across repeated resolutions', () => {
    const container = createRendererContainer();

    for (const key of TOKEN_KEYS) {
      const token = TOKENS[key] as ServiceIdentifier;
      expect(container.get(token), key).toBe(container.get(token));
    }
  });

  it('replaces an already-bound token with an override', () => {
    const fakeLoggerFactory = { create: vi.fn() };
    const container = applyBindingOverrides(createRendererContainer(), TOKENS, { loggerFactory: fakeLoggerFactory });

    expect(container.get(TOKENS.loggerFactory)).toBe(fakeLoggerFactory);
  });

  it('hands out the container singletons through the component host', () => {
    const container = createRendererContainer();
    const host = container.get(TOKENS.uiComponentHost);

    expect(host.get('streamingControlsComponent')).toBe(container.get(TOKENS.streamingControlsComponent));
    expect(host.get('notesPanelComponent')).toBe(container.get(TOKENS.notesPanelComponent));
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
