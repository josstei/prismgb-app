/**
 * DeviceService Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DeviceService } from '@renderer/infrastructure/services/devices/device.service.ts';
import { DeviceConnectionService } from '@renderer/infrastructure/services/devices/device-connection.service.ts';
import { DeviceStorageService } from '@renderer/infrastructure/services/devices/device-storage.service.ts';
import { DeviceMediaService } from '@renderer/infrastructure/services/devices/device-media.service.ts';
import {
  createDeviceInfo,
  createBrowserMediaServiceMock,
  createDeviceChangeDebounceAdapterMock,
  createDeviceStatusProviderMock,
  createEventBus,
  createLoggerFactory,
  createMediaStreamMock,
  createMediaTrackMock,
  createStorageService
} from '../../../../factories/index.js';

describe('DeviceService', () => {
  let service;
  let mockEventBus;
  let mockDeviceStatusProvider;
  let mockLoggerFactory;
  let mockDeviceConnectionLogger;
  let mockDeviceMediaLogger;
  let mockStorageService;
  let mockBrowserMediaService;
  let mockDeviceChangeDebounceAdapter;
  let deviceConnectionService;
  let deviceStorageService;
  let deviceMediaService;

  beforeEach(() => {
    mockEventBus = createEventBus();

    mockDeviceStatusProvider = createDeviceStatusProviderMock();

    mockLoggerFactory = createLoggerFactory();

    mockStorageService = createStorageService();

    mockBrowserMediaService = createBrowserMediaServiceMock();

    // Mock device change debounce adapter
    mockDeviceChangeDebounceAdapter = createDeviceChangeDebounceAdapterMock();

    // Mock console
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Create sub-services (following the new DI pattern)
    deviceStorageService = new DeviceStorageService({
      storageService: mockStorageService,
      loggerFactory: mockLoggerFactory
    });

    deviceConnectionService = new DeviceConnectionService({
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory,
      deviceStatusProvider: mockDeviceStatusProvider
    });

    deviceMediaService = new DeviceMediaService({
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory,
      browserMediaService: mockBrowserMediaService,
      deviceConnectionService,
      deviceStorageService,
      deviceChangeDebounceAdapter: mockDeviceChangeDebounceAdapter
    });

    service = new DeviceService({
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory,
      deviceStatusProvider: mockDeviceStatusProvider,
      deviceConnectionService,
      deviceStorageService,
      deviceMediaService
    });

    mockDeviceConnectionLogger = mockLoggerFactory._getLogger('DeviceConnectionService');
    mockDeviceMediaLogger = mockLoggerFactory._getLogger('DeviceMediaService');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with empty videoDevices', () => {
      expect(service.deviceMediaService.videoDevices).toEqual([]);
    });

    it('should initialize with isConnected null', () => {
      expect(service.isConnected).toBeNull();
    });

    it('should initialize with hasMediaPermission false', () => {
      expect(service.deviceMediaService.hasMediaPermission).toBe(false);
    });
  });

  describe('_isMatchingDevice', () => {
    it('should return device ID for labels with Chromatic VID:PID', () => {
      // Linux-style labels with VID:PID
      expect(service.deviceMediaService._isMatchingDevice('Chromatic (374e:0101)')).toBe('chromatic-mod-retro');
      expect(service.deviceMediaService._isMatchingDevice('ModRetro Chromatic (374e:0101)')).toBe('chromatic-mod-retro');
    });

    it('should return device ID for labels with Chromatic name patterns', () => {
      // Windows/Mac-style labels without VID:PID
      expect(service.deviceMediaService._isMatchingDevice('ModRetro Chromatic')).toBe('chromatic-mod-retro');
      expect(service.deviceMediaService._isMatchingDevice('chromatic')).toBe('chromatic-mod-retro');
    });

    it('should return null for non-Chromatic labels', () => {
      expect(service.deviceMediaService._isMatchingDevice('Random Webcam')).toBeNull();
      expect(service.deviceMediaService._isMatchingDevice('Integrated Camera (04f2:b7e0)')).toBeNull();
    });
  });

  describe('getSelectedDeviceId', () => {
    it('should auto-select Chromatic when no device selected', () => {
      service.deviceMediaService.videoDevices = [
        createDeviceInfo({ deviceId: 'webcam-1', label: 'Integrated Camera (04f2:b7e0)', kind: 'videoinput' }),
        createDeviceInfo({ deviceId: 'chromatic-1', label: 'Chromatic (374e:0101)', kind: 'videoinput' })
      ];

      const result = service.getSelectedDeviceId();

      expect(result).toBe('chromatic-1');
    });

    it('should return null when no Chromatic found', () => {
      service.deviceMediaService.videoDevices = [
        createDeviceInfo({ deviceId: 'webcam-1', label: 'Regular Webcam', kind: 'videoinput' })
      ];

      const result = service.getSelectedDeviceId();

      expect(result).toBeNull();
    });

    it('should return null when no devices', () => {
      service.deviceMediaService.videoDevices = [];
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
      expect(mockDeviceConnectionLogger.error).toHaveBeenCalled();
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
    const mockTrack = createMediaTrackMock({ stop: vi.fn() });
    const mockChromaticDevice = createDeviceInfo({
      deviceId: 'chromatic-1',
      kind: 'videoinput',
      label: 'Chromatic (374e:0101)'
    });
    const mockWebcam = createDeviceInfo({
      deviceId: 'webcam-1',
      kind: 'videoinput',
      label: 'Integrated Camera (04f2:b7e0)'
    });
    const mockStream = createMediaStreamMock({ tracks: [mockTrack] });

    beforeEach(() => {
      mockDeviceStatusProvider.getDeviceStatus.mockResolvedValue({ connected: true });
      mockBrowserMediaService.getUserMedia.mockResolvedValue(mockStream);
      mockBrowserMediaService.enumerateDevices.mockResolvedValue([
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

      expect(mockBrowserMediaService.getUserMedia).not.toHaveBeenCalled();
    });

    it('should set hasMediaPermission true when devices have labels', async () => {
      // If we can see device labels, permission was already granted elsewhere
      await service.enumerateDevices();

      expect(service.deviceMediaService.hasMediaPermission).toBe(true);
    });

    it('should not set hasMediaPermission when devices have no labels', async () => {
      // Devices without labels means permission not yet granted
      mockBrowserMediaService.enumerateDevices.mockResolvedValue([
        createDeviceInfo({ deviceId: 'dev-1', kind: 'videoinput', label: '' }),
        createDeviceInfo({ deviceId: 'dev-2', kind: 'videoinput', label: '' })
      ]);

      await service.enumerateDevices();

      expect(service.deviceMediaService.hasMediaPermission).toBe(false);
    });

    it('should store device ID when supported device found with label', async () => {
      await service.enumerateDevices();

      expect(mockStorageService.getItem('chromatic-mod-retro_id')).toBe('chromatic-1');
    });

    it('should publish canonical supported device payload when a new device appears', async () => {
      await service.enumerateDevices();

      expect(mockEventBus.publish).toHaveBeenCalledWith('device:supported-device-available', {
        device: mockChromaticDevice,
        videoDevices: [mockChromaticDevice]
      });
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
      expect(result).toBe(service.deviceMediaService._lastEnumerateResult);
    });

    it('should handle enumerateDevices failure gracefully', async () => {
      const error = new Error('Enumeration failed');
      mockBrowserMediaService.enumerateDevices.mockRejectedValue(error);

      const result = await service.enumerateDevices();

      expect(result.devices).toEqual([]);
      expect(mockDeviceMediaLogger.warn).toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalledWith('device:enumeration-failed', {
        error: 'Enumeration failed',
        reason: 'webcam_access'
      });
    });
  });

  describe('setupDeviceChangeListener', () => {
    it('should subscribe via debounce adapter', () => {
      service.setupDeviceChangeListener();

      expect(mockDeviceChangeDebounceAdapter.subscribe).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    it('should store unsubscribe reference for cleanup', () => {
      service.setupDeviceChangeListener();

      expect(service.deviceMediaService._unsubscribeDeviceChange).toBeInstanceOf(Function);
    });

    it('should update status and enumerate on devicechange callback', async () => {
      mockDeviceStatusProvider.getDeviceStatus.mockResolvedValue({ connected: true });
      mockBrowserMediaService.enumerateDevices.mockResolvedValue([]);

      service.setupDeviceChangeListener();

      // Trigger the callback stored by debounce adapter mock
      await mockDeviceChangeDebounceAdapter._callback();

      // Should update status from provider
      expect(mockDeviceStatusProvider.getDeviceStatus).toHaveBeenCalled();
      // Should enumerate devices
      expect(mockBrowserMediaService.enumerateDevices).toHaveBeenCalled();
    });
  });

  describe('discoverSupportedDevice', () => {
    beforeEach(() => {
      mockDeviceStatusProvider.getDeviceStatus.mockResolvedValue({ connected: true });
    });

    it('should not probe random devices when no stored ID', async () => {
      const stop = vi.fn();
      mockBrowserMediaService.enumerateDevices
        .mockResolvedValueOnce([
          createDeviceInfo({ deviceId: 'dev-1', kind: 'videoinput', label: '' }),
          createDeviceInfo({ deviceId: 'dev-2', kind: 'videoinput', label: '' })
        ])
        .mockResolvedValueOnce([
          createDeviceInfo({ deviceId: 'dev-1', kind: 'videoinput', label: 'Random Webcam' }),
          createDeviceInfo({ deviceId: 'dev-2', kind: 'videoinput', label: 'Another Camera' })
        ]);

      const stream = createMediaStreamMock({
        tracks: [createMediaTrackMock({ stop })]
      });
      mockBrowserMediaService.getUserMedia.mockResolvedValue(stream);

      const result = await service.discoverSupportedDevice();

      expect(result).toBeNull();
      expect(mockBrowserMediaService.getUserMedia).toHaveBeenCalledWith({ video: true });
      expect(mockBrowserMediaService.getUserMedia).toHaveBeenCalledTimes(1);
    });

    it('should request permission only for stored device ID', async () => {
      mockStorageService.setItem('chromatic-mod-retro_id', 'stored-dev');

      // First enumerate (before permission) - labels hidden
      mockBrowserMediaService.enumerateDevices
        .mockResolvedValueOnce([
          createDeviceInfo({ deviceId: 'stored-dev', kind: 'videoinput', label: '' })
        ])
        // Second enumerate (after warm-up permission) - labels revealed with matching device
        .mockResolvedValueOnce([
          createDeviceInfo({ deviceId: 'stored-dev', kind: 'videoinput', label: 'Chromatic (374e:0101)' })
        ]);

      const stop = vi.fn();
      const stream = createMediaStreamMock({
        tracks: [createMediaTrackMock({ stop })]
      });
      mockBrowserMediaService.getUserMedia.mockResolvedValue(stream);

      const result = await service.discoverSupportedDevice();

      expect(mockBrowserMediaService.getUserMedia).toHaveBeenCalledWith({ video: true });
      expect(stop).toHaveBeenCalled();
      expect(result?.deviceId).toBe('stored-dev');
    });

    it('should stop after stored ID probe fails without probing others', async () => {
      mockStorageService.setItem('chromatic-mod-retro_id', 'old-stale-id');

      mockBrowserMediaService.enumerateDevices
        .mockResolvedValueOnce([
          createDeviceInfo({ deviceId: 'new-dev-1', kind: 'videoinput', label: '' })
        ])
        .mockResolvedValueOnce([
          createDeviceInfo({ deviceId: 'new-dev-1', kind: 'videoinput', label: 'Random Webcam' })
        ]);

      const stop = vi.fn();
      const warmUpStream = createMediaStreamMock({
        tracks: [createMediaTrackMock({ stop })]
      });
      mockBrowserMediaService.getUserMedia
        .mockResolvedValueOnce(warmUpStream)
        .mockRejectedValueOnce(new Error('Device not found'));

      const result = await service.discoverSupportedDevice();

      expect(mockBrowserMediaService.getUserMedia).toHaveBeenCalledTimes(2);
      expect(mockBrowserMediaService.getUserMedia).toHaveBeenNthCalledWith(1, { video: true });
      expect(mockBrowserMediaService.getUserMedia).toHaveBeenNthCalledWith(2, {
        video: { deviceId: { exact: 'old-stale-id' } }
      });
      expect(result).toBeNull();
    });

    it('should register supported device after successful start', () => {
      const device = createDeviceInfo({ deviceId: 'chromatic-1', kind: 'videoinput', label: 'Chromatic (374e:0101)' });

      const result = service.registerSupportedDevice(device);

      expect(result).toBe(true);
      expect(mockStorageService.getItem('chromatic-mod-retro_id')).toBe('chromatic-1');
      expect(service.deviceMediaService.hasMediaPermission).toBe(true);
      expect(service.deviceMediaService.videoDevices).toEqual([device]);
    });
  });

  describe('_warmUpPermissions', () => {
    it('should deduplicate concurrent warm-up calls', async () => {
      mockBrowserMediaService.enumerateDevices
        .mockResolvedValueOnce([
          createDeviceInfo({ deviceId: 'dev-1', kind: 'videoinput', label: '' })
        ])
        .mockResolvedValueOnce([
          createDeviceInfo({ deviceId: 'dev-1', kind: 'videoinput', label: 'Random Webcam' })
        ]);

      const stop = vi.fn();
      const stream = createMediaStreamMock({
        tracks: [createMediaTrackMock({ stop })]
      });
      mockBrowserMediaService.getUserMedia.mockResolvedValue(stream);

      const promise1 = deviceMediaService._warmUpPermissions();
      const promise2 = deviceMediaService._warmUpPermissions();

      await Promise.all([promise1, promise2]);

      expect(mockBrowserMediaService.getUserMedia).toHaveBeenCalledTimes(1);
    });

    it('should handle warm-up failure gracefully', async () => {
      mockBrowserMediaService.getUserMedia.mockRejectedValue(new Error('Permission denied'));

      await deviceMediaService._warmUpPermissions();

      expect(mockDeviceMediaLogger.debug).toHaveBeenCalledWith('Permission warm-up failed:', 'Permission denied');
      expect(deviceMediaService.hasMediaPermission).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should call unsubscribe function', () => {
      const mockUnsubscribe = vi.fn();
      service.deviceMediaService._unsubscribeDeviceChange = mockUnsubscribe;

      service.dispose();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it('should clear unsubscribe reference', () => {
      service.deviceMediaService._unsubscribeDeviceChange = vi.fn();

      service.dispose();

      expect(service.deviceMediaService._unsubscribeDeviceChange).toBeNull();
    });

    it('should handle no unsubscribe set', () => {
      service.deviceMediaService._unsubscribeDeviceChange = null;

      expect(() => service.dispose()).not.toThrow();
    });
  });
});
