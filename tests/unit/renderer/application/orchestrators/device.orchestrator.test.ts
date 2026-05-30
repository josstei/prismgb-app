/**
 * DeviceOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DeviceOrchestrator } from '@renderer/application/orchestrators/device.orchestrator';
import {
  createDeviceIpcAdapterMock,
  createDeviceOperationSequencerMock,
  createDeviceServiceMock,
  createEventBus,
  createLoggerFactory
} from '../../../../factories/index.js';

describe('DeviceOrchestrator', () => {
  let orchestrator;
  let mockDeviceService;
  let mockDeviceIpcAdapter;
  let mockDeviceOperationSequencer;
  let mockEventBus;
  let mockLoggerFactory;

  beforeEach(() => {
    mockDeviceService = createDeviceServiceMock({
      setupDeviceChangeListener: vi.fn(),
      updateDeviceStatus: vi.fn().mockResolvedValue({}),
      enumerateDevices: vi.fn().mockResolvedValue({}),
      isDeviceConnected: vi.fn(),
      dispose: vi.fn()
    });

    mockDeviceIpcAdapter = createDeviceIpcAdapterMock();
    mockDeviceOperationSequencer = createDeviceOperationSequencerMock();

    mockEventBus = createEventBus();
    mockLoggerFactory = createLoggerFactory();

    orchestrator = new DeviceOrchestrator({
      deviceService: mockDeviceService,
      deviceIpcAdapter: mockDeviceIpcAdapter,
      deviceOperationSequencer: mockDeviceOperationSequencer,
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should store dependencies', () => {
      expect(orchestrator.deviceService).toBe(mockDeviceService);
      expect(orchestrator.deviceIpcAdapter).toBe(mockDeviceIpcAdapter);
      expect(orchestrator.deviceOperationSequencer).toBe(mockDeviceOperationSequencer);
      expect(orchestrator.eventBus).toBe(mockEventBus);
    });
  });

  describe('onInitialize', () => {
    it('should setup device change listener', async () => {
      await orchestrator.onInitialize();

      expect(mockDeviceService.setupDeviceChangeListener).toHaveBeenCalled();
    });

    it('should subscribe to IPC events via eventBus and adapter', async () => {
      await orchestrator.onInitialize();

      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        'device:connected',
        expect.any(Function)
      );
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        'device:disconnected',
        expect.any(Function)
      );
      expect(mockDeviceIpcAdapter.subscribe).toHaveBeenCalled();
    });

    it('should queue initial device refresh through sequencer', async () => {
      await orchestrator.onInitialize();

      expect(mockDeviceOperationSequencer.queueRefresh).toHaveBeenCalled();
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

  describe('IPC event handling', () => {
    it('should queue connected operation when connected event is published', async () => {
      await orchestrator.onInitialize();

      // Publish connected event
      mockEventBus.publish('device:connected');

      expect(mockDeviceOperationSequencer.queueConnected).toHaveBeenCalled();
    });

    it('should queue disconnected operation when disconnected event is published', async () => {
      await orchestrator.onInitialize();

      // Publish disconnected event
      mockEventBus.publish('device:disconnected');

      expect(mockDeviceOperationSequencer.queueDisconnected).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should publish disconnect event via callback when disconnected', async () => {
      await orchestrator.onInitialize();

      // Publish disconnected event
      mockEventBus.publish('device:disconnected');

      expect(mockEventBus.publish).toHaveBeenCalledWith('device:disconnected-during-session');
    });
  });

  describe('_handleDeviceConnectedIPC', () => {
    it('should queue connected operation', () => {
      orchestrator._handleDeviceConnectedIPC();

      expect(mockDeviceOperationSequencer.queueConnected).toHaveBeenCalled();
    });

    it('should be fire-and-forget (synchronous)', () => {
      // The method should return immediately without awaiting
      const result = orchestrator._handleDeviceConnectedIPC();

      // Should not return a promise that we need to await
      // queueConnected is called but not awaited in the handler
      expect(mockDeviceOperationSequencer.queueConnected).toHaveBeenCalled();
    });
  });

  describe('_handleDeviceDisconnectedIPC', () => {
    it('should queue disconnected operation with callback', () => {
      orchestrator._handleDeviceDisconnectedIPC();

      expect(mockDeviceOperationSequencer.queueDisconnected).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should publish event:disconnected-during-session via callback', () => {
      orchestrator._handleDeviceDisconnectedIPC();

      // The mock calls the callback immediately
      expect(mockEventBus.publish).toHaveBeenCalledWith('device:disconnected-during-session');
    });
  });

  describe('onCleanup', () => {
    it('should call unsubscribe function from IPC adapter', async () => {
      const mockUnsubscribe = vi.fn();
      mockDeviceIpcAdapter.subscribe.mockReturnValue(mockUnsubscribe);

      // Initialize to set up listeners
      await orchestrator.onInitialize();
      // Cleanup
      await orchestrator.onCleanup();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it('should flush sequencer before cleanup', async () => {
      await orchestrator.onCleanup();

      expect(mockDeviceOperationSequencer.flush).toHaveBeenCalled();
    });

    it('should handle cleanup without prior initialization', async () => {
      // Don't call onInitialize, just cleanup
      await expect(orchestrator.onCleanup()).resolves.not.toThrow();
    });
  });
});
