/**
 * DeviceOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DeviceOrchestrator } from '@features/devices/services/device.orchestrator.js';

describe('DeviceOrchestrator', () => {
  let orchestrator;
  let mockDeviceService;
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

    // Mock window.deviceAPI - return unsubscribe functions
    window.deviceAPI = {
      onDeviceConnected: vi.fn(() => vi.fn()),  // Returns unsubscribe function
      onDeviceDisconnected: vi.fn(() => vi.fn()),  // Returns unsubscribe function
      removeDeviceListeners: vi.fn()
    };

    orchestrator = new DeviceOrchestrator({
      deviceService: mockDeviceService,
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
      expect(orchestrator.eventBus).toBe(mockEventBus);
    });
  });

  describe('onInitialize', () => {
    it('should setup device change listener', async () => {
      await orchestrator.onInitialize();

      expect(mockDeviceService.setupDeviceChangeListener).toHaveBeenCalled();
    });

    it('should setup IPC event listeners', async () => {
      await orchestrator.onInitialize();

      expect(window.deviceAPI.onDeviceConnected).toHaveBeenCalled();
      expect(window.deviceAPI.onDeviceDisconnected).toHaveBeenCalled();
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

  describe('_setupIPCEventListeners', () => {
    it('should register device connected callback', async () => {
      await orchestrator.onInitialize();

      expect(window.deviceAPI.onDeviceConnected).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should register device disconnected callback', async () => {
      await orchestrator.onInitialize();

      expect(window.deviceAPI.onDeviceDisconnected).toHaveBeenCalledWith(expect.any(Function));
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
    it('should call unsubscribe functions for IPC listeners', async () => {
      const mockUnsubConnected = vi.fn();
      const mockUnsubDisconnected = vi.fn();
      window.deviceAPI.onDeviceConnected.mockReturnValue(mockUnsubConnected);
      window.deviceAPI.onDeviceDisconnected.mockReturnValue(mockUnsubDisconnected);

      // Initialize to set up listeners
      await orchestrator.onInitialize();
      // Cleanup
      await orchestrator.onCleanup();

      expect(mockUnsubConnected).toHaveBeenCalled();
      expect(mockUnsubDisconnected).toHaveBeenCalled();
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
