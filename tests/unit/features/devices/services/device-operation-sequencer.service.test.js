/**
 * DeviceOperationSequencerService Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DeviceOperationSequencerService } from '@renderer/infrastructure/services/devices/device-operation-sequencer.service.ts';

describe('DeviceOperationSequencerService', () => {
  let service;
  let mockDeviceMediaService;
  let mockEventBus;
  let mockLogger;

  beforeEach(() => {
    mockDeviceMediaService = {
      updateConnectionStatus: vi.fn().mockResolvedValue({}),
      enumerateDevices: vi.fn().mockResolvedValue({})
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

    service = new DeviceOperationSequencerService({
      deviceMediaService: mockDeviceMediaService,
      eventBus: mockEventBus,
      loggerFactory: { create: vi.fn(() => mockLogger) }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should store dependencies', () => {
      expect(service.deviceMediaService).toBe(mockDeviceMediaService);
      expect(service.eventBus).toBe(mockEventBus);
    });

    it('should initialize queue state', () => {
      expect(service.getQueueDepth()).toBe(0);
    });
  });

  describe('queueConnected', () => {
    it('should update status then enumerate devices', async () => {
      const callOrder = [];
      mockDeviceMediaService.updateConnectionStatus.mockImplementation(() => {
        callOrder.push('updateConnectionStatus');
        return Promise.resolve({});
      });
      mockDeviceMediaService.enumerateDevices.mockImplementation(() => {
        callOrder.push('enumerateDevices');
        return Promise.resolve({});
      });

      await service.queueConnected();

      expect(callOrder).toEqual(['updateConnectionStatus', 'enumerateDevices']);
    });

    it('should log operation execution', async () => {
      await service.queueConnected();

      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Queuing connected'));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Executing connected'));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Completed connected'));
    });
  });

  describe('queueDisconnected', () => {
    it('should update status', async () => {
      await service.queueDisconnected();

      expect(mockDeviceMediaService.updateConnectionStatus).toHaveBeenCalled();
    });

    it('should call callback after status update', async () => {
      const callback = vi.fn();
      const callOrder = [];

      mockDeviceMediaService.updateConnectionStatus.mockImplementation(() => {
        callOrder.push('updateConnectionStatus');
        return Promise.resolve({});
      });

      await service.queueDisconnected(() => {
        callOrder.push('callback');
        callback();
      });

      expect(callOrder).toEqual(['updateConnectionStatus', 'callback']);
      expect(callback).toHaveBeenCalled();
    });

    it('should handle missing callback gracefully', async () => {
      await expect(service.queueDisconnected()).resolves.not.toThrow();
      await expect(service.queueDisconnected(null)).resolves.not.toThrow();
      await expect(service.queueDisconnected('not a function')).resolves.not.toThrow();
    });

    it('should NOT enumerate devices', async () => {
      await service.queueDisconnected();

      expect(mockDeviceMediaService.enumerateDevices).not.toHaveBeenCalled();
    });
  });

  describe('queueRefresh', () => {
    it('should update status then enumerate devices', async () => {
      const callOrder = [];
      mockDeviceMediaService.updateConnectionStatus.mockImplementation(() => {
        callOrder.push('updateConnectionStatus');
        return Promise.resolve({});
      });
      mockDeviceMediaService.enumerateDevices.mockImplementation(() => {
        callOrder.push('enumerateDevices');
        return Promise.resolve({});
      });

      await service.queueRefresh();

      expect(callOrder).toEqual(['updateConnectionStatus', 'enumerateDevices']);
    });
  });

  describe('Sequential execution', () => {
    it('should execute operations in order', async () => {
      const callOrder = [];

      mockDeviceMediaService.updateConnectionStatus
        .mockImplementationOnce(() => {
          callOrder.push('first-status');
          return Promise.resolve({});
        })
        .mockImplementationOnce(() => {
          callOrder.push('second-status');
          return Promise.resolve({});
        });

      mockDeviceMediaService.enumerateDevices
        .mockImplementationOnce(() => {
          callOrder.push('first-enumerate');
          return Promise.resolve({});
        })
        .mockImplementationOnce(() => {
          callOrder.push('second-enumerate');
          return Promise.resolve({});
        });

      // Queue two operations - they should execute sequentially
      const promise1 = service.queueConnected();
      const promise2 = service.queueConnected();

      await Promise.all([promise1, promise2]);

      // Operations should complete in order
      expect(callOrder).toEqual([
        'first-status', 'first-enumerate',
        'second-status', 'second-enumerate'
      ]);
    });

    it('should handle rapid sequential calls', async () => {
      const calls = [];

      mockDeviceMediaService.updateConnectionStatus.mockImplementation(() => {
        calls.push('status');
        return Promise.resolve({});
      });
      mockDeviceMediaService.enumerateDevices.mockImplementation(() => {
        calls.push('enumerate');
        return Promise.resolve({});
      });

      // Fire 5 rapid operations
      const promises = [
        service.queueConnected(),
        service.queueDisconnected(),
        service.queueConnected(),
        service.queueRefresh(),
        service.queueConnected()
      ];

      await Promise.all(promises);

      // All operations should have completed
      expect(service.getQueueDepth()).toBe(0);
      // 5 status updates (3 connected + 1 disconnected + 1 refresh)
      // 4 enumerations (3 connected + 1 refresh, disconnected doesn't enumerate)
      expect(mockDeviceMediaService.updateConnectionStatus).toHaveBeenCalledTimes(5);
      expect(mockDeviceMediaService.enumerateDevices).toHaveBeenCalledTimes(4);
    });
  });

  describe('Error handling', () => {
    it('should continue queue processing after error', async () => {
      mockDeviceMediaService.updateConnectionStatus
        .mockRejectedValueOnce(new Error('First failed'))
        .mockResolvedValueOnce({});

      mockDeviceMediaService.enumerateDevices.mockResolvedValue({});

      // First will fail, second should still run
      const promise1 = service.queueConnected();
      const promise2 = service.queueConnected();

      await promise1;
      await promise2;

      // Second operation should have run despite first failing
      expect(mockDeviceMediaService.updateConnectionStatus).toHaveBeenCalledTimes(2);
    });

    it('should log errors without rethrowing', async () => {
      const error = new Error('Test error');
      mockDeviceMediaService.updateConnectionStatus.mockRejectedValue(error);

      await expect(service.queueConnected()).resolves.not.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error in connected'),
        error
      );
    });
  });

  describe('getQueueDepth', () => {
    it('should track queue depth correctly', async () => {
      expect(service.getQueueDepth()).toBe(0);

      // Use a deferred pattern that works with the sequencer
      let resolveStatus;
      const statusPromise = new Promise(resolve => { resolveStatus = resolve; });
      mockDeviceMediaService.updateConnectionStatus.mockReturnValue(statusPromise);
      mockDeviceMediaService.enumerateDevices.mockResolvedValue({});

      // Queue first operation - increments depth immediately
      const promise1 = service.queueConnected();

      // Need to allow the queue to process and start the operation
      await Promise.resolve();
      expect(service.getQueueDepth()).toBe(1);

      // Queue second operation
      const promise2 = service.queueConnected();
      expect(service.getQueueDepth()).toBe(2);

      // Resolve the first status call and let operations complete
      resolveStatus({});
      mockDeviceMediaService.updateConnectionStatus.mockResolvedValue({});

      await promise1;
      await promise2;

      expect(service.getQueueDepth()).toBe(0);
    });
  });

  describe('flush', () => {
    it('should wait for all queued operations', async () => {
      let resolveOp;
      mockDeviceMediaService.updateConnectionStatus.mockImplementation(
        () => new Promise(resolve => { resolveOp = resolve; })
      );
      mockDeviceMediaService.enumerateDevices.mockResolvedValue({});

      service.queueConnected();

      const flushPromise = service.flush();
      let flushed = false;
      flushPromise.then(() => { flushed = true; });

      // Should not be flushed yet
      await Promise.resolve();
      expect(flushed).toBe(false);

      // Complete the operation
      resolveOp({});
      await flushPromise;

      expect(flushed).toBe(true);
    });

    it('should resolve immediately when queue is empty', async () => {
      await expect(service.flush()).resolves.not.toThrow();
    });
  });
});
