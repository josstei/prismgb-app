/**
 * DeviceOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DeviceOrchestrator } from '@renderer/application/orchestrators/device.orchestrator.ts';
import { EventChannels } from '@renderer/common/config/event-channels';

describe('DeviceOrchestrator', () => {
  let orchestrator;
  let mockDeviceMediaService;
  let mockDeviceIpcAdapter;
  let mockDeviceOperationSequencer;
  let mockEventBus;
  let mockLogger;

  beforeEach(() => {
    mockDeviceMediaService = {
      setupDeviceChangeListener: vi.fn(),
      dispose: vi.fn()
    };

    mockDeviceIpcAdapter = {
      subscribe: vi.fn(() => vi.fn())
    };

    mockDeviceOperationSequencer = {
      queueConnected: vi.fn().mockResolvedValue(undefined),
      queueDisconnected: vi.fn().mockImplementation((callback) => {
        if (typeof callback === 'function') {
          callback();
        }
        return Promise.resolve();
      }),
      queueRefresh: vi.fn().mockResolvedValue(undefined),
      flush: vi.fn().mockResolvedValue(undefined)
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
      deviceMediaService: mockDeviceMediaService,
      deviceIpcAdapter: mockDeviceIpcAdapter,
      deviceOperationSequencer: mockDeviceOperationSequencer,
      eventBus: mockEventBus,
      loggerFactory: { create: vi.fn(() => mockLogger) }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores dependencies', () => {
    expect(orchestrator.deviceMediaService).toBe(mockDeviceMediaService);
    expect(orchestrator.deviceIpcAdapter).toBe(mockDeviceIpcAdapter);
    expect(orchestrator.deviceOperationSequencer).toBe(mockDeviceOperationSequencer);
  });

  it('sets up device change listener and IPC subscriptions on initialize', async () => {
    await orchestrator.onInitialize();

    expect(mockDeviceMediaService.setupDeviceChangeListener).toHaveBeenCalledWith(expect.any(Function));
    expect(mockDeviceIpcAdapter.subscribe).toHaveBeenCalledWith(expect.any(Function), expect.any(Function));
    expect(mockDeviceOperationSequencer.queueRefresh).toHaveBeenCalled();
  });

  it('queues refresh when media listener callback runs', async () => {
    await orchestrator.onInitialize();
    const onChange = mockDeviceMediaService.setupDeviceChangeListener.mock.calls[0][0];

    await onChange();
    expect(mockDeviceOperationSequencer.queueRefresh).toHaveBeenCalledTimes(2);
  });

  it('queues connected and disconnected operations from IPC handlers', async () => {
    let onConnected;
    let onDisconnected;
    mockDeviceIpcAdapter.subscribe.mockImplementation((connected, disconnected) => {
      onConnected = connected;
      onDisconnected = disconnected;
      return vi.fn();
    });

    await orchestrator.onInitialize();
    onConnected();
    onDisconnected();

    expect(mockDeviceOperationSequencer.queueConnected).toHaveBeenCalled();
    expect(mockDeviceOperationSequencer.queueDisconnected).toHaveBeenCalledWith(expect.any(Function));
    expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.DEVICE.DISCONNECTED_DURING_SESSION);
  });

  it('flushes sequencer and disposes device media service on cleanup', async () => {
    const unsubscribe = vi.fn();
    mockDeviceIpcAdapter.subscribe.mockReturnValue(unsubscribe);

    await orchestrator.onInitialize();
    await orchestrator.onCleanup();

    expect(unsubscribe).toHaveBeenCalled();
    expect(mockDeviceOperationSequencer.flush).toHaveBeenCalled();
    expect(mockDeviceMediaService.dispose).toHaveBeenCalled();
  });
});
