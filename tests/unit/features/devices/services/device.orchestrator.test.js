/**
 * DeviceOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DeviceOrchestrator } from '@renderer/features/devices/services/device.orchestrator.js';

describe('DeviceOrchestrator', () => {
  let orchestrator;
  let mockDeviceService;
  let mockDeviceIPCAdapter;
  let mockEventBus;
  let mockLogger;

  beforeEach(() => {
    mockDeviceService = {
      setupDeviceChangeListener: vi.fn(),
      updateDeviceStatus: vi.fn().mockResolvedValue({}),
      enumerateDevices: vi.fn().mockResolvedValue({}),
      isDeviceConnected: vi.fn(),
      dispose: vi.fn()
    };

    mockDeviceIPCAdapter = {
      subscribe: vi.fn(() => vi.fn()),  // Returns unsubscribe function
      dispose: vi.fn()
    };

    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn(() => vi.fn())
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    orchestrator = new DeviceOrchestrator({
      deviceService: mockDeviceService,
      deviceIPCAdapter: mockDeviceIPCAdapter,
      eventBus: mockEventBus,
      loggerFactory: { create: vi.fn(() => mockLogger) }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should store dependencies', () => {
      expect(orchestrator.deviceService).toBe(mockDeviceService);
      expect(orchestrator.deviceIPCAdapter).toBe(mockDeviceIPCAdapter);
      expect(orchestrator.eventBus).toBe(mockEventBus);
    });
  });

  describe('onInitialize', () => {
    it('should setup device change listener', async () => {
      await orchestrator.onInitialize();

      expect(mockDeviceService.setupDeviceChangeListener).toHaveBeenCalled();
    });

    it('should subscribe to IPC events via adapter', async () => {
      await orchestrator.onInitialize();

      expect(mockDeviceIPCAdapter.subscribe).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('should check initial device status', async () => {
      await orchestrator.onInitialize();

      expect(mockDeviceService.updateDeviceStatus).toHaveBeenCalled();
    });
  });

  describe('isDeviceConnected', () => {
    it('should return true when device connected', () => {
      mockDeviceService.isDeviceConnected.mockReturnValue(true);

      expect(orchestrator.isDeviceConnected()).toBe(true);
    });

    it('should return false when device disconnected', () => {
      mockDeviceService.isDeviceConnected.mockReturnValue(false);

      expect(orchestrator.isDeviceConnected()).toBe(false);
    });
  });

  describe('IPC event handling via adapter', () => {
    it('should call connected handler when adapter triggers connected event', async () => {
      let connectedCallback;
      mockDeviceIPCAdapter.subscribe.mockImplementation((onConnected, onDisconnected) => {
        connectedCallback = onConnected;
        return vi.fn();
      });

      await orchestrator.onInitialize();

      // Simulate IPC connected event
      await connectedCallback();

      expect(mockDeviceService.updateDeviceStatus).toHaveBeenCalledTimes(2); // Once in init, once in handler
    });

    it('should call disconnected handler when adapter triggers disconnected event', async () => {
      let disconnectedCallback;
      mockDeviceIPCAdapter.subscribe.mockImplementation((onConnected, onDisconnected) => {
        disconnectedCallback = onDisconnected;
        return vi.fn();
      });

      await orchestrator.onInitialize();

      // Simulate IPC disconnected event
      await disconnectedCallback();

      expect(mockDeviceService.updateDeviceStatus).toHaveBeenCalledTimes(2); // Once in init, once in handler
      expect(mockEventBus.publish).toHaveBeenCalledWith('device:disconnected-during-session');
    });
  });

  describe('_handleDeviceConnectedIPC', () => {
    it('should update device status', async () => {
      await orchestrator._handleDeviceConnectedIPC();

      expect(mockDeviceService.updateDeviceStatus).toHaveBeenCalled();
    });

    it('should NOT enumerate devices (deferred to streaming start)', async () => {
      // Camera enumeration is deferred to prevent macOS webcam flicker
      await orchestrator._handleDeviceConnectedIPC();

      expect(mockDeviceService.enumerateDevices).not.toHaveBeenCalled();
    });
  });

  describe('_handleDeviceDisconnectedIPC', () => {
    it('should update device status', async () => {
      await orchestrator._handleDeviceDisconnectedIPC();

      expect(mockDeviceService.updateDeviceStatus).toHaveBeenCalled();
    });

    it('should NOT enumerate devices (deferred to streaming start)', async () => {
      // Camera enumeration is deferred to prevent macOS webcam flicker
      await orchestrator._handleDeviceDisconnectedIPC();

      expect(mockDeviceService.enumerateDevices).not.toHaveBeenCalled();
    });

    it('should publish device:disconnected-during-session event', async () => {
      await orchestrator._handleDeviceDisconnectedIPC();

      expect(mockEventBus.publish).toHaveBeenCalledWith('device:disconnected-during-session');
    });
  });

  describe('onCleanup', () => {
    it('should call unsubscribe function from IPC adapter', async () => {
      const mockUnsubscribe = vi.fn();
      mockDeviceIPCAdapter.subscribe.mockReturnValue(mockUnsubscribe);

      // Initialize to set up listeners
      await orchestrator.onInitialize();
      // Cleanup
      await orchestrator.onCleanup();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it('should dispose device service', async () => {
      await orchestrator.onCleanup();

      expect(mockDeviceService.dispose).toHaveBeenCalled();
    });

    it('should handle cleanup without prior initialization', async () => {
      // Don't call onInitialize, just cleanup
      await expect(orchestrator.onCleanup()).resolves.not.toThrow();
    });

    it('should handle missing dispose method on deviceService', async () => {
      orchestrator.deviceService = {};

      await expect(orchestrator.onCleanup()).resolves.not.toThrow();
    });
  });
});
