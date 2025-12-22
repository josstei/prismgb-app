/**
 * Renderer Container Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock all the imported modules before importing the container
vi.mock('@infrastructure/di/service-container.js', () => {
  return {
    ServiceContainer: class MockServiceContainer {
      constructor() {
        this.registerSingleton = vi.fn();
        this.resolve = vi.fn();
        this.dispose = vi.fn();
      }
    },
    asValue: vi.fn((val) => ({ __asValue: true, value: val }))
  };
});

// Application layer mocks
vi.mock('@app/renderer/application/app.state.js', () => ({
  AppState: vi.fn()
}));

vi.mock('@app/renderer/application/app.orchestrator.js', () => ({
  AppOrchestrator: vi.fn()
}));

vi.mock('@app/renderer/application/performance/animation-performance.orchestrator.js', () => ({
  AnimationPerformanceOrchestrator: vi.fn()
}));

vi.mock('@app/renderer/application/performance/performance-state.coordinator.js', () => ({
  PerformanceStateCoordinator: vi.fn()
}));

// UI layer mocks
vi.mock('@ui/orchestration/ui-setup.orchestrator.js', () => ({
  UISetupOrchestrator: vi.fn()
}));

vi.mock('@ui/controller/component.factory.js', () => ({
  UIComponentFactory: vi.fn()
}));

vi.mock('@ui/controller/component.registry.js', () => ({
  UIComponentRegistry: vi.fn()
}));

vi.mock('@ui/effects/ui-effects.js', () => ({
  UIEffects: vi.fn()
}));

vi.mock('@ui/orchestration/event-handler.js', () => ({
  UIEventHandler: vi.fn()
}));

// Features: Devices mocks
vi.mock('@features/devices/services/device.service.js', () => ({
  DeviceService: vi.fn()
}));

vi.mock('@features/devices/services/device.orchestrator.js', () => ({
  DeviceOrchestrator: vi.fn()
}));

vi.mock('@features/devices/services/device-status.adapter.js', () => ({
  IpcDeviceStatusAdapter: vi.fn()
}));

// Features: Streaming mocks
vi.mock('@features/streaming/services/streaming.service.js', () => ({
  StreamingService: vi.fn()
}));

vi.mock('@features/streaming/services/streaming.orchestrator.js', () => ({
  StreamingOrchestrator: vi.fn()
}));

vi.mock('@features/streaming/factories/adapter.factory.js', () => ({
  AdapterFactory: vi.fn()
}));

vi.mock('@features/streaming/rendering/canvas.renderer.js', () => ({
  CanvasRenderer: vi.fn()
}));

vi.mock('@features/streaming/rendering/viewport.manager.js', () => ({
  ViewportManager: vi.fn()
}));

vi.mock('@features/streaming/rendering/gpu/gpu.renderer.service.js', () => ({
  GPURendererService: vi.fn()
}));

// Features: Capture mocks
vi.mock('@features/capture/services/capture.service.js', () => ({
  CaptureService: vi.fn()
}));

vi.mock('@features/capture/services/capture.orchestrator.js', () => ({
  CaptureOrchestrator: vi.fn()
}));

// Features: Settings mocks
vi.mock('@features/settings/services/settings.service.js', () => ({
  SettingsService: vi.fn()
}));

vi.mock('@features/settings/services/preferences.orchestrator.js', () => ({
  PreferencesOrchestrator: vi.fn()
}));

vi.mock('@features/settings/services/display-mode.orchestrator.js', () => ({
  DisplayModeOrchestrator: vi.fn()
}));

// Infrastructure mocks
vi.mock('@infrastructure/events/event-bus.js', () => ({
  default: vi.fn()
}));

vi.mock('@infrastructure/logging/logger.js', () => ({
  BrowserLogger: vi.fn()
}));

vi.mock('@infrastructure/browser/storage.service.js', () => ({
  StorageService: vi.fn()
}));

vi.mock('@infrastructure/browser/media-devices.service.js', () => ({
  MediaDevicesService: vi.fn()
}));

// Shared mocks
vi.mock('@shared/utils/performance-cache.js', () => ({
  AnimationCache: vi.fn()
}));

// Import the container module
import * as containerModuleImport from '@app/renderer/container.js';

describe('Renderer Container', () => {
  let containerModule;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Setup window.deviceAPI for ipcClient registration
    window.deviceAPI = { test: true };

    containerModule = containerModuleImport;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    containerModule.resetContainer();
  });

  describe('createRendererContainer', () => {
    it('should create a new ServiceContainer', () => {
      const container = containerModule.createRendererContainer();

      expect(container).toBeDefined();
      expect(container.registerSingleton).toBeDefined();
    });

    it('should register eventBus singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'eventBus',
        expect.any(Function),
        ['loggerFactory']
      );
    });

    it('should register loggerFactory singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'loggerFactory',
        expect.any(Function),
        []
      );
    });

    it('should register ipcClient singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'ipcClient',
        expect.any(Function),
        []
      );
    });

    it('should register deviceStatusProvider singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'deviceStatusProvider',
        expect.any(Function),
        ['ipcClient']
      );
    });

    it('should register adapterFactory singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'adapterFactory',
        expect.any(Function),
        ['eventBus', 'loggerFactory']
      );
    });

    it('should register appState singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'appState',
        expect.any(Function),
        ['streamingService', 'deviceService', 'eventBus']
      );
    });

    it('should register uiComponentRegistry singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'uiComponentRegistry',
        expect.any(Function),
        ['uiComponentFactory', 'eventBus', 'loggerFactory']
      );
    });

    it('should register uiEffects singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'uiEffects',
        expect.any(Function),
        []
      );
    });

    it('should register deviceService singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'deviceService',
        expect.any(Function),
        ['eventBus', 'loggerFactory', 'deviceStatusProvider', 'storageService', 'mediaDevicesService']
      );
    });

    it('should register streamingService singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'streamingService',
        expect.any(Function),
        ['deviceService', 'eventBus', 'loggerFactory', 'adapterFactory', 'ipcClient']
      );
    });

    it('should register renderPipelineService singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'renderPipelineService',
        expect.any(Function),
        ['appState', 'uiController', 'canvasRenderer', 'viewportManager', 'streamHealthMonitor', 'gpuRendererService', 'eventBus', 'loggerFactory']
      );
    });

    it('should register captureService singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'captureService',
        expect.any(Function),
        ['eventBus', 'loggerFactory']
      );
    });

    it('should register settingsService singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'settingsService',
        expect.any(Function),
        ['eventBus', 'loggerFactory', 'storageService']
      );
    });

    it('should register deviceOrchestrator singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'deviceOrchestrator',
        expect.any(Function),
        ['deviceService', 'eventBus', 'loggerFactory']
      );
    });

    it('should register streamingOrchestrator singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'streamingOrchestrator',
        expect.any(Function),
        ['streamingService', 'appState', 'uiController', 'renderPipelineService', 'eventBus', 'loggerFactory']
      );
    });

    it('should register captureOrchestrator singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'captureOrchestrator',
        expect.any(Function),
        ['captureService', 'appState', 'uiController', 'gpuRendererService', 'canvasRenderer', 'eventBus', 'loggerFactory']
      );
    });

    it('should register appOrchestrator singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'appOrchestrator',
        expect.any(Function),
        expect.arrayContaining(['deviceOrchestrator', 'streamingOrchestrator', 'captureOrchestrator'])
      );
    });
  });

  describe('initializeContainer', () => {
    it('should create and return container', () => {
      const container = containerModule.initializeContainer();

      expect(container).toBeDefined();
    });

    it('should log initialization message', () => {
      containerModule.initializeContainer();

      expect(console.log).toHaveBeenCalledWith('DI Container initialized with domain services');
    });

    it('should warn if already initialized', () => {
      containerModule.initializeContainer();
      containerModule.initializeContainer();

      expect(console.warn).toHaveBeenCalledWith('Container already initialized');
    });

    it('should return existing container on second call', () => {
      const first = containerModule.initializeContainer();
      const second = containerModule.initializeContainer();

      expect(second).toBe(first);
    });
  });

  describe('getContainer', () => {
    it('should throw if container not initialized', () => {
      expect(() => containerModule.getContainer()).toThrow(
        'Container not initialized. Call initializeContainer() first.'
      );
    });

    it('should return container after initialization', () => {
      containerModule.initializeContainer();

      const container = containerModule.getContainer();

      expect(container).toBeDefined();
    });
  });

  describe('resetContainer', () => {
    it('should dispose container', () => {
      const container = containerModule.initializeContainer();

      containerModule.resetContainer();

      expect(container.dispose).toHaveBeenCalled();
    });

    it('should handle reset when not initialized', () => {
      expect(() => containerModule.resetContainer()).not.toThrow();
    });
  });

  describe('exports', () => {
    it('should export EventBus', () => {
      expect(containerModule.EventBus).toBeDefined();
    });

    it('should export BrowserLogger', () => {
      expect(containerModule.BrowserLogger).toBeDefined();
    });

    it('should export asValue', () => {
      expect(containerModule.asValue).toBeDefined();
    });
  });

  describe('ipcClient factory', () => {
    it('should throw when deviceAPI not available', () => {
      const originalAPI = window.deviceAPI;
      window.deviceAPI = undefined;

      const container = containerModule.createRendererContainer();

      // Get the ipcClient factory function that was registered
      const registerCalls = container.registerSingleton.mock.calls;
      const ipcClientCall = registerCalls.find(call => call[0] === 'ipcClient');
      const factoryFn = ipcClientCall[1];

      expect(() => factoryFn()).toThrow('deviceAPI is not available');

      // Restore
      window.deviceAPI = originalAPI;
    });

    it('should return deviceAPI when available', () => {
      const container = containerModule.createRendererContainer();

      // Get the ipcClient factory function that was registered
      const registerCalls = container.registerSingleton.mock.calls;
      const ipcClientCall = registerCalls.find(call => call[0] === 'ipcClient');
      const factoryFn = ipcClientCall[1];

      expect(factoryFn()).toBe(window.deviceAPI);
    });
  });
});
