/**
 * Renderer App Orchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const { MockUIController } = vi.hoisted(() => ({
  MockUIController: vi.fn(function() {
    this.elements = {};
    this.dispose = vi.fn();
    this.initializeComponents = vi.fn();
  })
}));

vi.mock('@renderer/presentation/controller/ui.controller.js', () => ({
  UIController: MockUIController
}));

vi.mock('@renderer/application/container.ts', async () => {
  const { createRendererAppContainerMock } = await import('../../../factories/index.js');

  return {
    initializeContainer: vi.fn(() => createRendererAppContainerMock()),
    asValue: vi.fn((val) => ({ __asValue: true, value: val }))
  };
});

const { RendererAppOrchestrator } = await import('@renderer/renderer-app.orchestrator.js');

describe('RendererAppOrchestrator', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    delete document.body.dataset.prismgbAppStarted;

    app = new RendererAppOrchestrator();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

    it('should initialize UI', async () => {
      await app.initialize();

      expect(MockUIController).toHaveBeenCalled();
      expect(app._uiController).toBeDefined();
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

      expect(console.warn).toHaveBeenCalledWith('[RendererAppOrchestrator]', 'Renderer application already initialized');
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
