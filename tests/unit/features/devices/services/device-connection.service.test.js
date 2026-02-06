/**
 * DeviceConnectionService Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeviceConnectionService } from '@renderer/infrastructure/services/devices/device-connection.service.ts';
import { createMockEventBus, createMockLoggerFactory } from '../../../../mocks/index.js';

function createMockDeviceStatusProvider(overrides = {}) {
  return {
    getDeviceStatus: vi.fn(() => Promise.resolve({ connected: false })),
    ...overrides
  };
}

describe('DeviceConnectionService', () => {
  let service;
  let mockEventBus;
  let mockLoggerFactory;
  let mockDeviceStatusProvider;

  beforeEach(() => {
    mockEventBus = createMockEventBus();
    mockLoggerFactory = createMockLoggerFactory();
    mockDeviceStatusProvider = createMockDeviceStatusProvider();

    service = new DeviceConnectionService({
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory,
      deviceStatusProvider: mockDeviceStatusProvider
    });
  });

  describe('constructor', () => {
    it('should initialize with null connection status', () => {
      expect(service.isConnected).toBeNull();
    });
  });

  describe('getStatus', () => {
    it('should return current connection status', () => {
      service.isConnected = true;
      const status = service.getStatus();
      expect(status).toEqual({ connected: true });
    });

    it('should return null when status not set', () => {
      const status = service.getStatus();
      expect(status).toEqual({ connected: null });
    });

    it('should return false when disconnected', () => {
      service.isConnected = false;
      const status = service.getStatus();
      expect(status).toEqual({ connected: false });
    });
  });

  describe('updateConnectionStatus', () => {
    it('should update connection status from provider', async () => {
      mockDeviceStatusProvider.getDeviceStatus.mockResolvedValue({ connected: true });

      await service.updateConnectionStatus();

      expect(service.isConnected).toBe(true);
    });

    it('should publish event when status changes', async () => {
      mockDeviceStatusProvider.getDeviceStatus.mockResolvedValue({ connected: true });

      const result = await service.updateConnectionStatus();

      expect(result.changed).toBe(true);
      expect(mockEventBus.publish).toHaveBeenCalled();
    });

    it('should not publish event when status unchanged', async () => {
      service.isConnected = false;
      mockDeviceStatusProvider.getDeviceStatus.mockResolvedValue({ connected: false });

      const result = await service.updateConnectionStatus();

      expect(result.changed).toBe(false);
      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });

    it('should throw and log error on provider failure', async () => {
      const error = new Error('Provider error');
      mockDeviceStatusProvider.getDeviceStatus.mockRejectedValue(error);

      await expect(service.updateConnectionStatus()).rejects.toThrow('Provider error');
    });
  });
});
