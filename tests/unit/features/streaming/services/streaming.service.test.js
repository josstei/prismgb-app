/**
 * StreamingService Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StreamingService } from '@features/streaming/services/streaming.service.js';

describe('StreamingService', () => {
  let service;
  let mockDependencies;
  let mockEventBus;
  let mockDeviceService;
  let mockAdapterRegistry;
  let mockIpcClient;
  let mockLogger;
  let mockAdapter;

  beforeEach(() => {
    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn()
    };

    mockDeviceService = {
      getRegisteredStoredDeviceIds: vi.fn(),
      enumerateDevices: vi.fn(),
      discoverSupportedDevice: vi.fn(),
      cacheSupportedDevice: vi.fn()
    };

    mockAdapter = {
      getStream: vi.fn(),
      releaseStream: vi.fn().mockResolvedValue(undefined),
      getCapabilities: vi.fn()
    };

    mockAdapterRegistry = {
      getAdapterForDevice: vi.fn(() => mockAdapter)
    };

    mockIpcClient = {
      getDeviceStatus: vi.fn()
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockDependencies = {
      deviceService: mockDeviceService,
      eventBus: mockEventBus,
      loggerFactory: { create: vi.fn(() => mockLogger) },
      adapterFactory: mockAdapterRegistry,
      ipcClient: mockIpcClient
    };

    service = new StreamingService(mockDependencies);
  });

  describe('Constructor', () => {
    it('should initialize with null stream', () => {
      expect(service.currentStream).toBeNull();
    });

    it('should initialize with null adapter', () => {
      expect(service.currentAdapter).toBeNull();
    });

    it('should initialize with isStreaming false', () => {
      expect(service.isStreaming).toBe(false);
    });
  });

  describe('start', () => {
    const mockDevice = { deviceId: 'device-1', label: 'Chromatic', kind: 'videoinput' };
    const mockVideoTrack = {
      getSettings: vi.fn(() => ({ width: 160 })),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    const mockStream = {
      id: 'stream-1',
      getVideoTracks: vi.fn(() => [mockVideoTrack]),
      getAudioTracks: vi.fn(() => [])
    };

    beforeEach(() => {
      mockDeviceService.enumerateDevices.mockResolvedValue({ devices: [mockDevice], connected: true });
      mockAdapter.getStream.mockResolvedValue(mockStream);
      mockAdapter.getCapabilities.mockResolvedValue({ hasAudio: true });
    });

    it('should start streaming with specific device ID', async () => {
      const result = await service.start('device-1');

      expect(result.stream).toBe(mockStream);
      expect(result.device).toBe(mockDevice);
      expect(service.isStreaming).toBe(true);
    });

    it('should auto-select device when no ID provided', async () => {
      mockDeviceService.getRegisteredStoredDeviceIds.mockReturnValue(['device-1']);

      const result = await service.start();

      expect(result.device).toBe(mockDevice);
    });

    it('should stop existing stream before starting new one', async () => {
      // Set state machine to streaming state
      service._state = 'streaming';
      service.currentStream = mockStream;
      service.currentAdapter = mockAdapter;

      await service.start('device-1');

      expect(mockAdapter.releaseStream).toHaveBeenCalled();
    });

    it('should publish stream:started event', async () => {
      await service.start('device-1');

      expect(mockEventBus.publish).toHaveBeenCalledWith('stream:started', expect.objectContaining({
        stream: mockStream,
        device: mockDevice
      }));
    });

    it('should throw when device not found', async () => {
      mockDeviceService.enumerateDevices.mockResolvedValue({ devices: [], connected: false });

      await expect(service.start('unknown-device')).rejects.toThrow('Device not found');
    });

    it('should throw when no device available for auto-select', async () => {
      mockDeviceService.getRegisteredStoredDeviceIds.mockReturnValue([]);
      mockDeviceService.enumerateDevices.mockResolvedValue({
        devices: [{ deviceId: 'dev-1', kind: 'videoinput', label: '' }],
        connected: true
      });
      mockDeviceService.discoverSupportedDevice.mockResolvedValue(null);

      await expect(service.start()).rejects.toThrow('Chromatic camera not authorized');
    });

    it('should publish stream:error event on failure', async () => {
      const error = new Error('Stream failed');
      mockAdapter.getStream.mockRejectedValue(error);

      await expect(service.start('device-1')).rejects.toThrow();

      expect(mockEventBus.publish).toHaveBeenCalledWith('stream:error', {
        error,
        operation: 'start',
        deviceId: 'device-1',
        message: 'Stream failed'
      });
    });
  });

  describe('stop', () => {
    const mockStream = { id: 'stream-1' };

    beforeEach(() => {
      // Set state machine to streaming state
      service._state = 'streaming';
      service.currentStream = mockStream;
      service.currentAdapter = mockAdapter;
      service.currentDevice = { deviceId: 'device-1' };
    });

    it('should release stream via adapter', async () => {
      await service.stop();

      expect(mockAdapter.releaseStream).toHaveBeenCalledWith(mockStream);
    });

    it('should clear all state', async () => {
      await service.stop();

      expect(service.currentStream).toBeNull();
      expect(service.currentAdapter).toBeNull();
      expect(service.currentDevice).toBeNull();
      expect(service.isStreaming).toBe(false);
    });

    it('should publish stream:stopped event', async () => {
      await service.stop();

      expect(mockEventBus.publish).toHaveBeenCalledWith('stream:stopped');
    });

    it('should do nothing if not streaming', async () => {
      // Reset to idle state
      service._state = 'idle';

      await service.stop();

      expect(mockAdapter.releaseStream).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('Not streaming, nothing to stop');
    });
  });

  describe('getStream', () => {
    it('should return current stream', () => {
      const mockStream = { id: 'stream-1' };
      service.currentStream = mockStream;

      expect(service.getStream()).toBe(mockStream);
    });

    it('should return null when no stream', () => {
      expect(service.getStream()).toBeNull();
    });
  });

  describe('isActive', () => {
    it('should return true when streaming', () => {
      service._state = 'streaming';
      expect(service.isActive()).toBe(true);
    });

    it('should return false when not streaming', () => {
      service._state = 'idle';
      expect(service.isActive()).toBe(false);
    });
  });

  describe('_getDeviceById', () => {
    it('should find device by ID', async () => {
      const devices = [
        { deviceId: 'dev-1', kind: 'videoinput' },
        { deviceId: 'dev-2', kind: 'videoinput' }
      ];
      mockDeviceService.enumerateDevices.mockResolvedValue({ devices: devices, connected: true });

      const result = await service._getDeviceById('dev-2');

      expect(result.deviceId).toBe('dev-2');
    });

    it('should throw for non-existent device', async () => {
      mockDeviceService.enumerateDevices.mockResolvedValue({ devices: [], connected: false });

      await expect(service._getDeviceById('unknown')).rejects.toThrow('Device not found: unknown');
    });

    it('should filter by videoinput kind', async () => {
      const devices = [
        { deviceId: 'dev-1', kind: 'audioinput' },
        { deviceId: 'dev-1', kind: 'videoinput' }
      ];
      mockDeviceService.enumerateDevices.mockResolvedValue({ devices: devices, connected: true });

      const result = await service._getDeviceById('dev-1');

      expect(result.kind).toBe('videoinput');
    });
  });

  describe('_autoSelectDevice', () => {
    it('should use device from DeviceService first', async () => {
      const mockDevice = { deviceId: 'selected-dev', kind: 'videoinput', label: 'Chromatic' };
      mockDeviceService.getRegisteredStoredDeviceIds.mockReturnValue(['selected-dev']);
      mockDeviceService.enumerateDevices.mockResolvedValue({ devices: [mockDevice], connected: true });

      const result = await service._autoSelectDevice();

      expect(result.deviceId).toBe('selected-dev');
    });

    it('should fallback to label matching when stored IDs missing', async () => {
      mockDeviceService.getRegisteredStoredDeviceIds.mockReturnValue([]);
      mockDeviceService.enumerateDevices.mockResolvedValue({
        devices: [{ deviceId: 'chromatic-dev', kind: 'videoinput', label: 'ModRetro Chromatic' }],
        connected: true
      });

      const result = await service._autoSelectDevice();

      expect(result.label).toContain('Chromatic');
    });

    it('should throw when labels are hidden', async () => {
      mockDeviceService.getRegisteredStoredDeviceIds.mockReturnValue([]);
      mockDeviceService.enumerateDevices.mockResolvedValue({
        devices: [{ deviceId: 'dev-1', kind: 'videoinput', label: '' }],
        connected: true
      });

      await expect(service._autoSelectDevice()).rejects.toThrow('Chromatic camera not authorized');
    });

  });

  describe('ERROR state recovery', () => {
    const mockDevice = { deviceId: 'device-1', label: 'Chromatic', kind: 'videoinput' };
    const mockVideoTrack = {
      getSettings: vi.fn(() => ({ width: 160 })),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    const mockStream = {
      id: 'stream-1',
      getVideoTracks: vi.fn(() => [mockVideoTrack]),
      getAudioTracks: vi.fn(() => [])
    };

    beforeEach(() => {
      mockDeviceService.enumerateDevices.mockResolvedValue({ devices: [mockDevice], connected: true });
      mockAdapter.getCapabilities.mockResolvedValue({ hasAudio: true });
    });

    it('should clean up partial state when starting from ERROR state', async () => {
      // Simulate ERROR state with partial state
      service._state = 'error';
      service.currentAdapter = mockAdapter;
      service.currentStream = mockStream;
      service.currentDevice = mockDevice;

      // Set up successful start
      mockAdapter.getStream.mockResolvedValue(mockStream);

      await service.start('device-1');

      // Should have called releaseStream to clean up old stream
      expect(mockAdapter.releaseStream).toHaveBeenCalledWith(mockStream);
    });

    it('should allow restart after ERROR state', async () => {
      // First start fails
      const error = new Error('First attempt failed');
      mockAdapter.getStream.mockRejectedValueOnce(error);

      await expect(service.start('device-1')).rejects.toThrow('First attempt failed');
      expect(service._state).toBe('error');

      // Second start succeeds
      mockAdapter.getStream.mockResolvedValue(mockStream);

      const result = await service.start('device-1');

      expect(result.stream).toBe(mockStream);
      expect(service._state).toBe('streaming');
    });

    it('should clear partial state even if releaseStream fails during cleanup', async () => {
      // Simulate ERROR state with partial state
      service._state = 'error';
      service.currentAdapter = mockAdapter;
      service.currentStream = mockStream;
      service.currentDevice = mockDevice;

      // releaseStream fails during cleanup
      mockAdapter.releaseStream.mockRejectedValueOnce(new Error('Release failed'));

      // But new start should still work
      const newStream = { id: 'stream-2', getVideoTracks: vi.fn(() => [mockVideoTrack]), getAudioTracks: vi.fn(() => []) };
      mockAdapter.getStream.mockResolvedValue(newStream);

      const result = await service.start('device-1');

      // Should have tried to release old stream
      expect(mockAdapter.releaseStream).toHaveBeenCalledWith(mockStream);
      // But should have continued and got new stream
      expect(result.stream).toBe(newStream);
    });
  });

  describe('_getStreamSettings', () => {
    it('should return null when no stream', () => {
      service.currentStream = null;
      expect(service._getStreamSettings()).toBeNull();
    });

    it('should return video and audio settings', () => {
      const videoSettings = { width: 160, height: 144 };
      const audioSettings = { sampleRate: 48000 };

      service.currentStream = {
        getVideoTracks: vi.fn(() => [{ getSettings: vi.fn(() => videoSettings) }]),
        getAudioTracks: vi.fn(() => [{ getSettings: vi.fn(() => audioSettings) }])
      };

      const result = service._getStreamSettings();

      expect(result.video).toEqual(videoSettings);
      expect(result.audio).toEqual(audioSettings);
      expect(result.hasAudio).toBe(true);
    });

    it('should handle stream with no audio', () => {
      service.currentStream = {
        getVideoTracks: vi.fn(() => [{ getSettings: vi.fn(() => ({})) }]),
        getAudioTracks: vi.fn(() => [])
      };

      const result = service._getStreamSettings();

      expect(result.audio).toBeNull();
      expect(result.hasAudio).toBe(false);
    });

    it('should handle stream with no video', () => {
      service.currentStream = {
        getVideoTracks: vi.fn(() => []),
        getAudioTracks: vi.fn(() => [{ getSettings: vi.fn(() => ({})) }])
      };

      const result = service._getStreamSettings();

      expect(result.video).toBeNull();
    });
  });
});
