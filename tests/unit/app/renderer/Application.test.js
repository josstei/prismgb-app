/**
 * Renderer Application Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Use vi.hoisted to define mock before hoisted vi.mock call
const { MockUIController } = vi.hoisted(() => ({
  MockUIController: vi.fn(function() {
    this.elements = {};
    this.dispose = vi.fn();
    this.initializeComponents = vi.fn();
  })
}));

// Mock UIController module before importing Application
vi.mock('@ui/controller/controller.js', () => ({
  UIController: MockUIController
}));

// Mock the container module
vi.mock('@app/renderer/container.js', () => ({
  initializeContainer: vi.fn(() => ({
    resolve: vi.fn((name) => {
      if (name === 'appOrchestrator') {
        return {
          initialize: vi.fn().mockResolvedValue(),
          start: vi.fn().mockResolvedValue(),
          cleanup: vi.fn().mockResolvedValue()
        };
      }
      if (name === 'adapterFactory') {
        return {
          initialize: vi.fn().mockResolvedValue()
        };
      }
      if (name === 'uiComponentRegistry') {
        return {
          initialize: vi.fn(),
          initSettingsMenu: vi.fn(),
          get: vi.fn(),
          dispose: vi.fn()
        };
      }
      if (name === 'uiEffects') {
        return {
          elements: null,
          triggerShutterFlash: vi.fn(),
          triggerButtonFeedback: vi.fn()
        };
      }
      if (name === 'uiEventHandler') {
        return {
          initialize: vi.fn(),
          dispose: vi.fn()
        };
      }
      if (name === 'loggerFactory') {
        return {
          create: vi.fn(() => ({
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn()
          }))
        };
      }
      return {};
    }),
    register: vi.fn(),
    dispose: vi.fn()
  })),
  asValue: vi.fn((val) => ({ __asValue: true, value: val }))
}));

// Import Application after mocks are set up
const { Application } = await import('@app/renderer/Application.js');

describe('Application', () => {
  let app;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Mock console
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    app = new Application();
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

      expect(console.warn).toHaveBeenCalledWith('[Application]', 'Application already initialized');
    });
  });

  describe('start', () => {
    it('should throw if not initialized', async () => {
      await expect(app.start()).rejects.toThrow('Application not initialized');
    });

    it('should start orchestrator', async () => {
      await app.initialize();
      await app.start();

      expect(app.orchestrator.start).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should cleanup orchestrator', async () => {
      await app.initialize();
      await app.cleanup();

      expect(app.orchestrator.cleanup).toHaveBeenCalled();
    });

    it('should dispose container', async () => {
      await app.initialize();
      await app.cleanup();

      expect(app.container.dispose).toHaveBeenCalled();
    });

    it('should set isInitialized to false', async () => {
      await app.initialize();
      await app.cleanup();

      expect(app.isInitialized).toBe(false);
    });

    it('should handle cleanup without initialization', async () => {
      await expect(app.cleanup()).resolves.not.toThrow();
    });
  });
});
