/**
 * Renderer container composition tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class MockServiceContainer {
    dispose = vi.fn();
    disposeAsync = vi.fn().mockResolvedValue(undefined);
  }

  return {
    MockServiceContainer,
    asValue: vi.fn((value) => ({ __asValue: true, value })),
    registerInfrastructure: vi.fn(),
    registerDevices: vi.fn(),
    registerStreaming: vi.fn(),
    registerCapture: vi.fn(),
    registerUi: vi.fn(),
    registerOrchestrators: vi.fn(),
    setDefaultPreset: vi.fn()
  };
});

vi.mock('@renderer/infrastructure/di/service-container.factory.js', () => ({
  ServiceContainer: mocks.MockServiceContainer,
  asValue: mocks.asValue
}));

vi.mock('@renderer/application/di/register-infrastructure', () => ({
  registerInfrastructure: mocks.registerInfrastructure
}));

vi.mock('@renderer/application/di/register-devices', () => ({
  registerDevices: mocks.registerDevices
}));

vi.mock('@renderer/application/di/register-streaming', () => ({
  registerStreaming: mocks.registerStreaming
}));

vi.mock('@renderer/application/di/register-capture', () => ({
  registerCapture: mocks.registerCapture
}));

vi.mock('@renderer/application/di/register-ui', () => ({
  registerUi: mocks.registerUi
}));

vi.mock('@renderer/application/di/register-orchestrators', () => ({
  registerOrchestrators: mocks.registerOrchestrators
}));

vi.mock('@prismgb/gpu', () => ({
  PresetRegistry: {
    setDefault: mocks.setDefaultPreset
  }
}));

const containerModule = await import('@renderer/application/container');

describe('Renderer Container', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await containerModule.resetContainer();
  });

  afterEach(async () => {
    await containerModule.resetContainer();
    vi.restoreAllMocks();
  });

  describe('createRendererContainer', () => {
    it('creates a service container and runs all registration modules', () => {
      const container = containerModule.createRendererContainer();

      expect(container).toBeInstanceOf(mocks.MockServiceContainer);
      expect(mocks.registerInfrastructure).toHaveBeenCalledWith(container);
      expect(mocks.registerDevices).toHaveBeenCalledWith(container);
      expect(mocks.registerStreaming).toHaveBeenCalledWith(container);
      expect(mocks.registerCapture).toHaveBeenCalledWith(container);
      expect(mocks.registerUi).toHaveBeenCalledWith(container);
      expect(mocks.registerOrchestrators).toHaveBeenCalledWith(container);
    });
  });

  describe('initializeContainer', () => {
    it('initializes once and reuses singleton instance', () => {
      const first = containerModule.initializeContainer();
      const second = containerModule.initializeContainer();

      expect(first).toBe(second);
      expect(console.log).toHaveBeenCalledWith('DI Container initialized with domain services');
      expect(console.warn).toHaveBeenCalledWith('Container already initialized');
    });
  });

  describe('getContainer', () => {
    it('throws before initialization', () => {
      expect(() => containerModule.getContainer()).toThrow(
        'Container not initialized. Call initializeContainer() first.'
      );
    });

    it('returns initialized container', () => {
      const initialized = containerModule.initializeContainer();
      const resolved = containerModule.getContainer();

      expect(resolved).toBe(initialized);
    });
  });

  describe('resetContainer', () => {
    it('awaits disposeAsync when available', async () => {
      const container = containerModule.initializeContainer();

      await containerModule.resetContainer();

      expect(container.disposeAsync).toHaveBeenCalledTimes(1);
      expect(container.dispose).not.toHaveBeenCalled();
    });

    it('falls back to dispose when disposeAsync is unavailable', async () => {
      const container = containerModule.initializeContainer();
      container.disposeAsync = undefined;

      await containerModule.resetContainer();

      expect(container.dispose).toHaveBeenCalledTimes(1);
    });

    it('is safe when container is not initialized', async () => {
      await expect(containerModule.resetContainer()).resolves.toBeUndefined();
    });
  });

  describe('exports', () => {
    it('re-exports asValue helper', () => {
      expect(containerModule.asValue).toBe(mocks.asValue);
    });
  });
});
