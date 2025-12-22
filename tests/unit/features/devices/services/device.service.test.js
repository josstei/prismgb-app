/**
 * DeviceService Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DeviceService } from '@features/devices/services/device.service.js';

describe('DeviceService', () => {
  let service;
  let mockEventBus;
  let mockDeviceStatusProvider;
  let mockLogger;
  let mockStorageService;
  let mockMediaDevicesService;

  beforeEach(() => {
    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn()
    };

    mockDeviceStatusProvider = {
      getDeviceStatus: vi.fn()
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    // Mock storage service
    const storage = {};
    mockStorageService = {
      getItem: vi.fn((key) => storage[key] ?? null),
      setItem: vi.fn((key, value) => { storage[key] = value; }),
      removeItem: vi.fn((key) => { delete storage[key]; })
    };

    // Mock media devices service
    mockMediaDevicesService = {
      enumerateDevices: vi.fn(),
      getUserMedia: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    // Mock console
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    service = new DeviceService({
      eventBus: mockEventBus,
      loggerFactory: { create: vi.fn(() => mockLogger) },
      deviceStatusProvider: mockDeviceStatusProvider,
      storageService: mockStorageService,
      mediaDevicesService: mockMediaDevicesService
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with empty videoDevices', () => {
      expect(service.mediaDeviceService.videoDevices).toEqual([]);
    });

    it('should initialize with isConnected false', () => {
      expect(service.isConnected).toBe(false);
    });

    it('should initialize with hasMediaPermission false', () => {
      expect(service.mediaDeviceService.hasMediaPermission).toBe(false);
    });
  });

  describe('_isMatchingDevice', () => {
    it('should return device ID for labels with Chromatic VID:PID', () => {
      // Linux-style labels with VID:PID
      expect(service.mediaDeviceService._isMatchingDevice('Chromatic (374e:0101)')).toBe('chromatic-mod-retro');
      expect(service.mediaDeviceService._isMatchingDevice('ModRetro Chromatic (374e:0101)')).toBe('chromatic-mod-retro');
    });

    it('should return device ID for labels with Chromatic name patterns', () => {
      // Windows/Mac-style labels without VID:PID
      expect(service.mediaDeviceService._isMatchingDevice('ModRetro Chromatic')).toBe('chromatic-mod-retro');
      expect(service.mediaDeviceService._isMatchingDevice('chromatic')).toBe('chromatic-mod-retro');
    });

    it('should return null for non-Chromatic labels', () => {
      expect(service.mediaDeviceService._isMatchingDevice('Random Webcam')).toBeNull();
      expect(service.mediaDeviceService._isMatchingDevice('Integrated Camera (04f2:b7e0)')).toBeNull();
    });
  });

  describe('getSelectedDeviceId', () => {
    it('should auto-select Chromatic when no device selected', () => {
      service.mediaDeviceService.videoDevices = [
        { deviceId: 'webcam-1', label: 'Integrated Camera (04f2:b7e0)' },
        { deviceId: 'chromatic-1', label: 'Chromatic (374e:0101)' }
      ];

      const result = service.getSelectedDeviceId();

      expect(result).toBe('chromatic-1');
    });

    it('should return null when no Chromatic found', () => {
      service.mediaDeviceService.videoDevices = [
        { deviceId: 'webcam-1', label: 'Regular Webcam' }
      ];

      const result = service.getSelectedDeviceId();

      expect(result).toBeNull();
    });

    it('should return null when no devices', () => {
      service.mediaDeviceService.videoDevices = [];
      expect(service.getSelectedDeviceId()).toBeNull();
    });
  });

  describe('updateDeviceStatus', () => {
    it('should update connection status from provider', async () => {
      mockDeviceStatusProvider.getDeviceStatus.mockResolvedValue({ connected: true });

      const result = await service.updateDeviceStatus();

      expect(result.connected).toBe(true);
      expect(service.isConnected).toBe(true);
    });

    it('should publish device:status-changed event', async () => {
      const status = { connected: true };
      mockDeviceStatusProvider.getDeviceStatus.mockResolvedValue(status);

      await service.updateDeviceStatus();

      expect(mockEventBus.publish).toHaveBeenCalledWith('device:status-changed', status);
    });

    it('should throw on provider error', async () => {
      const error = new Error('Provider failed');
      mockDeviceStatusProvider.getDeviceStatus.mockRejectedValue(error);

      await expect(service.updateDeviceStatus()).rejects.toThrow('Provider failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('isDeviceConnected', () => {
    it('should return current connection state', () => {
      service.deviceConnectionService.isConnected = true;
      expect(service.isDeviceConnected()).toBe(true);

      service.deviceConnectionService.isConnected = false;
      expect(service.isDeviceConnected()).toBe(false);
    });
  });

  describe('enumerateDevices', () => {
    const mockChromaticDevice = {
      deviceId: 'chromatic-1',
      kind: 'videoinput',
      label: 'Chromatic (374e:0101)'
    };
    const mockWebcam = {
      deviceId: 'webcam-1',
      kind: 'videoinput',
      label: 'Integrated Camera (04f2:b7e0)'
    };
    const mockStream = {
      getTracks: vi.fn(() => [{ stop: vi.fn() }])
    };

    beforeEach(() => {
      mockDeviceStatusProvider.getDeviceStatus.mockResolvedValue({ connected: true });
      mockMediaDevicesService.getUserMedia.mockResolvedValue(mockStream);
      mockMediaDevicesService.enumerateDevices.mockResolvedValue([
        mockChromaticDevice,
        mockWebcam
      ]);
    });

    it('should enumerate and filter Chromatic devices', async () => {
      const result = await service.enumerateDevices();

      expect(result.devices).toHaveLength(1);
      expect(result.devices[0].label).toContain('Chromatic');
    });

    it('should never request getUserMedia during enumeration', async () => {
      // Even with a stored device ID, enumeration should not request permission
      // This prevents the Mac's built-in webcam from flickering
      mockStorageService.setItem('chromatic-mod-retro_id', 'chromatic-1');

      await service.enumerateDevices();

      expect(mockMediaDevicesService.getUserMedia).not.toHaveBeenCalled();
    });

    it('should set hasMediaPermission true when devices have labels', async () => {
      // If we can see device labels, permission was already granted elsewhere
      await service.enumerateDevices();

      expect(service.mediaDeviceService.hasMediaPermission).toBe(true);
    });

    it('should not set hasMediaPermission when devices have no labels', async () => {
      // Devices without labels means permission not yet granted
      mockMediaDevicesService.enumerateDevices.mockResolvedValue([
        { deviceId: 'dev-1', kind: 'videoinput', label: '' },
        { deviceId: 'dev-2', kind: 'videoinput', label: '' }
      ]);

      await service.enumerateDevices();

      expect(service.mediaDeviceService.hasMediaPermission).toBe(false);
    });

    it('should store device ID when supported device found with label', async () => {
      await service.enumerateDevices();

      expect(mockStorageService.getItem('chromatic-mod-retro_id')).toBe('chromatic-1');
    });

    it('should return connected status from provider', async () => {
      mockDeviceStatusProvider.getDeviceStatus.mockResolvedValue({ connected: true });

      const result = await service.enumerateDevices();

      expect(result.connected).toBe(true);
      expect(service.isConnected).toBe(true);
    });

    it('should deduplicate concurrent calls', async () => {
      // Start first call
      const promise1 = service.enumerateDevices();
      // Start second call while first is in flight
      const promise2 = service.enumerateDevices();

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Should return same result
      expect(result1).toBe(result2);
      // Provider should only be called once
      expect(mockDeviceStatusProvider.getDeviceStatus).toHaveBeenCalledTimes(1);
    });

    it('should return cached result within cooldown window', async () => {
      await service.enumerateDevices();

      // Second call within cooldown
      const result = await service.enumerateDevices();

      expect(mockDeviceStatusProvider.getDeviceStatus).toHaveBeenCalledTimes(1);
      expect(result).toBe(service.mediaDeviceService._lastEnumerateResult);
    });

    it('should handle enumerateDevices failure gracefully', async () => {
      const error = new Error('Enumeration failed');
      mockMediaDevicesService.enumerateDevices.mockRejectedValue(error);

      const result = await service.enumerateDevices();

      expect(result.devices).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalledWith('device:enumeration-failed', {
        error: 'Enumeration failed',
        reason: 'webcam_access'
      });
    });
  });

  describe('setupDeviceChangeListener', () => {
    it('should add devicechange event listener', () => {
      service.setupDeviceChangeListener();

      expect(mockMediaDevicesService.addEventListener).toHaveBeenCalledWith(
        'devicechange',
        expect.any(Function)
      );
    });

    it('should store handler reference for cleanup', () => {
      service.setupDeviceChangeListener();

      expect(service.mediaDeviceService._deviceChangeHandler).toBeInstanceOf(Function);
    });

    it('should update status but NOT enumerate devices on devicechange', async () => {
      // Camera enumeration is deferred to prevent macOS webcam flicker
      mockDeviceStatusProvider.getDeviceStatus.mockResolvedValue({ connected: true });

      service.setupDeviceChangeListener();

      // Trigger the handler
      await service.mediaDeviceService._deviceChangeHandler();

      // Should update status from provider
      expect(mockDeviceStatusProvider.getDeviceStatus).toHaveBeenCalled();
      // Should NOT enumerate cameras (no getUserMedia, no enumerateDevices camera probe)
      expect(mockMediaDevicesService.getUserMedia).not.toHaveBeenCalled();
    });
  });

  describe('discoverSupportedDevice', () => {
    const mockStream = {
      getTracks: vi.fn(() => [{ stop: vi.fn() }])
    };

    beforeEach(() => {
      mockDeviceStatusProvider.getDeviceStatus.mockResolvedValue({ connected: true });
    });

    it('should not probe random devices when no stored ID', async () => {
      mockMediaDevicesService.enumerateDevices.mockResolvedValue([
        { deviceId: 'dev-1', kind: 'videoinput', label: '' },
        { deviceId: 'dev-2', kind: 'videoinput', label: '' }
      ]);

      const result = await service.discoverSupportedDevice();

      expect(result).toBeNull();
      expect(mockMediaDevicesService.getUserMedia).not.toHaveBeenCalled();
    });

    it('should request permission only for stored device ID', async () => {
      mockStorageService.setItem('chromatic-mod-retro_id', 'stored-dev');

      // First enumerate (before permission) - labels hidden
      mockMediaDevicesService.enumerateDevices
        .mockResolvedValueOnce([
          { deviceId: 'stored-dev', kind: 'videoinput', label: '' }
        ])
        // Second enumerate (after permission) - labels revealed
        .mockResolvedValueOnce([
          { deviceId: 'stored-dev', kind: 'videoinput', label: 'Chromatic (374e:0101)' }
        ]);

      const stop = vi.fn();
      const stream = { getTracks: vi.fn(() => [{ stop }]) };
      mockMediaDevicesService.getUserMedia.mockResolvedValue(stream);

      const result = await service.discoverSupportedDevice();

      expect(mockMediaDevicesService.getUserMedia).toHaveBeenCalledWith({
        video: { deviceId: { exact: 'stored-dev' } }
      });
      expect(stop).toHaveBeenCalled();
      expect(result?.deviceId).toBe('stored-dev');
    });

    it('should stop after stored ID probe fails without probing others', async () => {
      mockStorageService.setItem('chromatic-mod-retro_id', 'old-stale-id');

      mockMediaDevicesService.enumerateDevices.mockResolvedValue([
        { deviceId: 'new-dev-1', kind: 'videoinput', label: '' }
      ]);

      mockMediaDevicesService.getUserMedia.mockRejectedValueOnce(new Error('Device not found'));

      const result = await service.discoverSupportedDevice();

      expect(mockMediaDevicesService.getUserMedia).toHaveBeenCalledTimes(1);
      expect(mockMediaDevicesService.getUserMedia).toHaveBeenCalledWith({
        video: { deviceId: { exact: 'old-stale-id' } }
      });
      expect(result).toBeNull();
    });

    it('should cache supported device after successful start', () => {
      const device = { deviceId: 'chromatic-1', kind: 'videoinput', label: 'Chromatic (374e:0101)' };

      const result = service.cacheSupportedDevice(device);

      expect(result).toBe(true);
      expect(mockStorageService.getItem('chromatic-mod-retro_id')).toBe('chromatic-1');
      expect(service.mediaDeviceService.hasMediaPermission).toBe(true);
      expect(service.mediaDeviceService.videoDevices).toEqual([device]);
    });
  });

  describe('dispose', () => {
    it('should remove devicechange listener', () => {
      const handler = vi.fn();
      service.mediaDeviceService._deviceChangeHandler = handler;

      service.dispose();

      expect(mockMediaDevicesService.removeEventListener).toHaveBeenCalledWith(
        'devicechange',
        handler
      );
    });

    it('should clear handler reference', () => {
      service.mediaDeviceService._deviceChangeHandler = vi.fn();

      service.dispose();

      expect(service.mediaDeviceService._deviceChangeHandler).toBeNull();
    });

    it('should handle no handler set', () => {
      service.mediaDeviceService._deviceChangeHandler = null;

      expect(() => service.dispose()).not.toThrow();
    });
  });
});
