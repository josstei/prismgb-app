/**
 * Renderer Bootstrap Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TOKENS } from '@renderer/application/di/tokens.js';

const { mockProbeBrowserGpuCapabilitiesForMeasurement } = vi.hoisted(() => ({
  mockProbeBrowserGpuCapabilitiesForMeasurement: vi.fn()
}));

vi.mock('@platform/gpu/runtime', () => ({
  probeBrowserGpuCapabilitiesForMeasurement: mockProbeBrowserGpuCapabilitiesForMeasurement
}));

vi.mock('@renderer/application/container.ts', async () => {
  const { createRendererAppContainerMock } = await import('../../factories/index.js');

  return {
    initializeContainer: vi.fn(() => createRendererAppContainerMock())
  };
});

vi.mock('@renderer/presentation/shell/app-shell.renderer.js', () => ({
  renderAppShell: vi.fn()
}));

const { RendererBootstrap } = await import('@renderer/app-bootstrap.js');

describe('RendererBootstrap', () => {
  let app;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    delete document.body.dataset.prismgbAppStarted;
    delete (window as unknown as Record<PropertyKey, unknown>)[Symbol.for('prismgb.performance.qualificationProbe')];
    delete (window as { prismgbPerformanceLaunchMarker?: unknown }).prismgbPerformanceLaunchMarker;
    vi.stubGlobal('__PRISMGB_PERF_HARNESS__', false);
    mockProbeBrowserGpuCapabilitiesForMeasurement.mockReset();

    app = new RendererBootstrap();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as unknown as Record<PropertyKey, unknown>)[Symbol.for('prismgb.performance.qualificationProbe')];
    delete (window as { prismgbPerformanceLaunchMarker?: unknown }).prismgbPerformanceLaunchMarker;
  });

  describe('Constructor', () => {
    it('should initialize with null container', () => {
      expect(app.container).toBeNull();
    });

    it('should initialize with null orchestrator', () => {
      expect(app.orchestrator).toBeNull();
    });

    it('should initialize with isInitialized false', () => {
      expect(app.isInitialized).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should initialize container', async () => {
      await app.initialize();

      expect(app.container).toBeDefined();
    });

    it('should initialize the presentation plane', async () => {
      await app.initialize();

      expect(app.container.get).toHaveBeenCalledWith(TOKENS.uiComponentHost);
      expect(app.container.get).toHaveBeenCalledWith(TOKENS.uiEffects);
      expect(app.container.get(TOKENS.uiComponentHost).touchCore).toHaveBeenCalled();
      expect(app.container.get(TOKENS.bodyClassManager).bindPresentationMode).toHaveBeenCalledWith(
        app.container.get(TOKENS.presentationModeStore)
      );
    });

    it('should resolve orchestrator', async () => {
      await app.initialize();

      expect(app.orchestrator).toBeDefined();
    });

    it('should set isInitialized to true', async () => {
      await app.initialize();

      expect(app.isInitialized).toBe(true);
    });

    it('should warn if already initialized', async () => {
      await app.initialize();
      await app.initialize();

      expect(console.warn).toHaveBeenCalledWith('[RendererBootstrap]', 'Renderer application already initialized');
    });

    it('installs a marker-bound harness qualification bridge that calls the measurement oracle', async () => {
      const launchId = '53a7cfe5-e204-4a45-8a0f-b0db2fbc9a18';
      const qualification = {
        webgpu: { status: 'available' },
        transferControlToOffscreen: { status: 'available' }
      };
      vi.stubGlobal('__PRISMGB_PERF_HARNESS__', true);
      Object.defineProperty(window, 'prismgbPerformanceLaunchMarker', {
        configurable: true,
        value: Object.freeze({ launchId })
      });
      mockProbeBrowserGpuCapabilitiesForMeasurement.mockResolvedValue(qualification);

      await app.initialize();

      const qualificationSymbol = Symbol.for('prismgb.performance.qualificationProbe');
      const descriptor = Object.getOwnPropertyDescriptor(window, qualificationSymbol);
      expect(descriptor).toMatchObject({ configurable: true, enumerable: false, writable: false });
      const probe = (window as unknown as Record<PropertyKey, (requestedLaunchId: string) => Promise<unknown>>)[
        qualificationSymbol
      ];
      await expect(probe(launchId)).resolves.toEqual(qualification);
      await expect(probe('f65a4447-7bc9-4c31-a2a5-d60d7dd1c13e')).rejects.toThrow(
        'Performance qualification probe launch ID does not match the preload marker'
      );
      expect(mockProbeBrowserGpuCapabilitiesForMeasurement).toHaveBeenCalledTimes(1);

      await app.cleanup();
      expect(Object.prototype.hasOwnProperty.call(window, qualificationSymbol)).toBe(false);
    });

    it('does not install the qualification bridge without both the harness and validated marker', async () => {
      const qualificationSymbol = Symbol.for('prismgb.performance.qualificationProbe');
      Object.defineProperty(window, 'prismgbPerformanceLaunchMarker', {
        configurable: true,
        value: Object.freeze({ launchId: '53a7cfe5-e204-4a45-8a0f-b0db2fbc9a18' })
      });

      await app.initialize();
      expect(Object.prototype.hasOwnProperty.call(window, qualificationSymbol)).toBe(false);

      await app.cleanup();
      vi.stubGlobal('__PRISMGB_PERF_HARNESS__', true);
      delete (window as { prismgbPerformanceLaunchMarker?: unknown }).prismgbPerformanceLaunchMarker;
      app = new RendererBootstrap();
      await app.initialize();
      expect(Object.prototype.hasOwnProperty.call(window, qualificationSymbol)).toBe(false);
      expect(mockProbeBrowserGpuCapabilitiesForMeasurement).not.toHaveBeenCalled();
    });
  });

  describe('start', () => {
    it('should throw if not initialized', async () => {
      await expect(app.start()).rejects.toThrow('Renderer application not initialized');
    });

    it('should start orchestrator', async () => {
      await app.initialize();
      await app.start();

      expect(app.orchestrator.start).toHaveBeenCalled();
    });

    it('should expose app-started lifecycle state after orchestrator start', async () => {
      await app.initialize();
      await app.start();

      expect(document.body.dataset.prismgbAppStarted).toBe('true');
    });
  });

  describe('cleanup', () => {
    it('should cleanup orchestrator', async () => {
      await app.initialize();
      const orchestrator = app.orchestrator;
      await app.cleanup();

      expect(orchestrator.cleanup).toHaveBeenCalled();
    });

    it('should dispose container', async () => {
      await app.initialize();
      const container = app.container;
      await app.cleanup();

      expect(container.dispose).toHaveBeenCalled();
    });

    it('should set isInitialized to false', async () => {
      await app.initialize();
      await app.cleanup();

      expect(app.isInitialized).toBe(false);
    });

    it('should clear app-started lifecycle state on cleanup', async () => {
      await app.initialize();
      await app.start();
      await app.cleanup();

      expect(document.body.dataset.prismgbAppStarted).toBeUndefined();
    });

    it('should handle cleanup without initialization', async () => {
      await expect(app.cleanup()).resolves.not.toThrow();
    });
  });
});
