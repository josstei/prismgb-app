/**
 * IpcDeviceStatusAdapter Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IpcDeviceStatusAdapter } from '@renderer/features/devices/adapters/ipc-device-status.adapter.js';
import { IDeviceStatusProvider } from '@shared/interfaces/device-status-provider.interface.js';

describe('IpcDeviceStatusAdapter', () => {
  let adapter;
  let mockIpcClient;

  beforeEach(() => {
    mockIpcClient = {
      getDeviceStatus: vi.fn()
    };

    adapter = new IpcDeviceStatusAdapter(mockIpcClient);
  });

  describe('Constructor', () => {
    it('should store ipcClient reference', () => {
      expect(adapter.ipcClient).toBe(mockIpcClient);
    });

    it('should extend IDeviceStatusProvider', () => {
      expect(adapter).toBeInstanceOf(IDeviceStatusProvider);
    });
  });

  describe('getDeviceStatus', () => {
    it('should delegate to ipcClient.getDeviceStatus', async () => {
      const mockStatus = { connected: true, deviceId: 'chromatic-123' };
      mockIpcClient.getDeviceStatus.mockResolvedValue(mockStatus);

      await adapter.getDeviceStatus();

      expect(mockIpcClient.getDeviceStatus).toHaveBeenCalledTimes(1);
      expect(mockIpcClient.getDeviceStatus).toHaveBeenCalledWith();
    });

    it('should return the result from ipcClient', async () => {
      const mockStatus = { connected: true, deviceId: 'chromatic-123' };
      mockIpcClient.getDeviceStatus.mockResolvedValue(mockStatus);

      const result = await adapter.getDeviceStatus();

      expect(result).toEqual(mockStatus);
      expect(result).toBe(mockStatus);
    });

    it('should return disconnected status from ipcClient', async () => {
      const mockStatus = { connected: false, deviceId: null };
      mockIpcClient.getDeviceStatus.mockResolvedValue(mockStatus);

      const result = await adapter.getDeviceStatus();

      expect(result).toEqual(mockStatus);
      expect(result.connected).toBe(false);
    });

    it('should propagate errors from ipcClient', async () => {
      const error = new Error('IPC communication failed');
      mockIpcClient.getDeviceStatus.mockRejectedValue(error);

      await expect(adapter.getDeviceStatus()).rejects.toThrow('IPC communication failed');
    });

    it('should propagate timeout errors from ipcClient', async () => {
      const timeoutError = new Error('Request timeout');
      mockIpcClient.getDeviceStatus.mockRejectedValue(timeoutError);

      await expect(adapter.getDeviceStatus()).rejects.toThrow('Request timeout');
    });

    it('should propagate generic errors from ipcClient', async () => {
      const genericError = new Error('Unknown error');
      mockIpcClient.getDeviceStatus.mockRejectedValue(genericError);

      await expect(adapter.getDeviceStatus()).rejects.toThrow('Unknown error');
    });

    it('should handle multiple sequential calls', async () => {
      const status1 = { connected: false, deviceId: null };
      const status2 = { connected: true, deviceId: 'chromatic-123' };
      const status3 = { connected: true, deviceId: 'chromatic-456' };

      mockIpcClient.getDeviceStatus
        .mockResolvedValueOnce(status1)
        .mockResolvedValueOnce(status2)
        .mockResolvedValueOnce(status3);

      const result1 = await adapter.getDeviceStatus();
      const result2 = await adapter.getDeviceStatus();
      const result3 = await adapter.getDeviceStatus();

      expect(result1).toEqual(status1);
      expect(result2).toEqual(status2);
      expect(result3).toEqual(status3);
      expect(mockIpcClient.getDeviceStatus).toHaveBeenCalledTimes(3);
    });

    it('should handle concurrent calls', async () => {
      const mockStatus = { connected: true, deviceId: 'chromatic-123' };
      mockIpcClient.getDeviceStatus.mockResolvedValue(mockStatus);

      const [result1, result2, result3] = await Promise.all([
        adapter.getDeviceStatus(),
        adapter.getDeviceStatus(),
        adapter.getDeviceStatus()
      ]);

      expect(result1).toEqual(mockStatus);
      expect(result2).toEqual(mockStatus);
      expect(result3).toEqual(mockStatus);
      expect(mockIpcClient.getDeviceStatus).toHaveBeenCalledTimes(3);
    });

    it('should return complex device status objects', async () => {
      const complexStatus = {
        connected: true,
        deviceId: 'chromatic-123',
        firmwareVersion: '1.2.3',
        batteryLevel: 85,
        capabilities: {
          hasVideo: true,
          hasAudio: true,
          resolution: { width: 160, height: 144 }
        }
      };
      mockIpcClient.getDeviceStatus.mockResolvedValue(complexStatus);

      const result = await adapter.getDeviceStatus();

      expect(result).toEqual(complexStatus);
      expect(result.capabilities.resolution.width).toBe(160);
    });

    it('should handle null/undefined return values from ipcClient', async () => {
      mockIpcClient.getDeviceStatus.mockResolvedValue(null);

      const result = await adapter.getDeviceStatus();

      expect(result).toBeNull();
    });

    it('should handle empty object return values from ipcClient', async () => {
      mockIpcClient.getDeviceStatus.mockResolvedValue({});

      const result = await adapter.getDeviceStatus();

      expect(result).toEqual({});
    });
  });

  describe('Interface Compliance', () => {
    it('should implement all IDeviceStatusProvider methods', () => {
      expect(typeof adapter.getDeviceStatus).toBe('function');
    });

    it('should not throw "Not implemented" error', async () => {
      const mockStatus = { connected: true };
      mockIpcClient.getDeviceStatus.mockResolvedValue(mockStatus);

      await expect(adapter.getDeviceStatus()).resolves.toEqual(mockStatus);
    });
  });

  describe('Edge Cases', () => {
    it('should work with ipcClient that returns undefined', async () => {
      mockIpcClient.getDeviceStatus.mockResolvedValue(undefined);

      const result = await adapter.getDeviceStatus();

      expect(result).toBeUndefined();
    });

    it('should handle ipcClient method that throws synchronously', async () => {
      mockIpcClient.getDeviceStatus.mockImplementation(() => {
        throw new Error('Synchronous error');
      });

      await expect(adapter.getDeviceStatus()).rejects.toThrow('Synchronous error');
    });

    it('should preserve error object properties when propagating', async () => {
      const error = new Error('Custom error');
      error.code = 'IPC_ERROR';
      error.details = { reason: 'Connection lost' };
      mockIpcClient.getDeviceStatus.mockRejectedValue(error);

      try {
        await adapter.getDeviceStatus();
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).toBe('Custom error');
        expect(err.code).toBe('IPC_ERROR');
        expect(err.details).toEqual({ reason: 'Connection lost' });
      }
    });
  });
});
