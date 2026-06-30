import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventChannels } from '@prismgb/events';
import { RendererDeviceRuntime } from '@renderer/infrastructure/services/devices/device-runtime.service';
import { createEventBus, createLoggerFactory } from '../../../../factories/index.js';
import type { DeviceStatus } from '@prismgb/devices';
import {
  CHROMATIC_SPECS,
  createChromaticVideoDeviceInfo
} from '../../../../devices/media.testkit';
import { createChromaticDeviceInfoPayload } from '../../../../devices/chromatic-manifest.testkit';

const connectedStatus: DeviceStatus = {
  state: 'connected',
  connected: true,
  device: createChromaticDeviceInfoPayload(),
  updatedAt: 1
};

const disconnectedStatus: DeviceStatus = {
  state: 'disconnected',
  connected: false,
  device: null,
  updatedAt: 2
};

function createMediaDevice(overrides: Partial<MediaDeviceInfo> = {}): MediaDeviceInfo {
  return createChromaticVideoDeviceInfo(overrides);
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function createRuntime() {
  let statusListener: ((status: DeviceStatus) => void) | null = null;
  let deviceChangeListener: (() => void) | null = null;
  const eventBus = createEventBus();
  const loggerFactory = createLoggerFactory();
  const statusUnsubscribe = vi.fn(() => {
    statusListener = null;
  });
  const deviceChangeUnsubscribe = vi.fn(() => {
    deviceChangeListener = null;
  });
  const statusPort = {
    getStatus: vi.fn(async () => connectedStatus),
    refreshStatus: vi.fn(async () => connectedStatus),
    subscribe: vi.fn((listener: (status: DeviceStatus) => void) => {
      statusListener = listener;
      return statusUnsubscribe;
    })
  };
  const mediaDevicesPort = {
    enumerateDevices: vi.fn(async () => [createMediaDevice()]),
    getUserMedia: vi.fn(),
    subscribeDeviceChange: vi.fn((listener: () => void) => {
      deviceChangeListener = listener;
      return deviceChangeUnsubscribe;
    })
  };
  const devicePreferenceStore = {
    getStoredDeviceIds: vi.fn(() => []),
    storeDeviceId: vi.fn()
  };
  const runtime = new RendererDeviceRuntime({
    deviceStatusPort: statusPort,
    mediaDevicesPort,
    devicePreferenceStore,
    eventBus,
    loggerFactory,
    now: () => 100
  });

  return {
    runtime,
    eventBus,
    statusPort,
    mediaDevicesPort,
    devicePreferenceStore,
    statusUnsubscribe,
    deviceChangeUnsubscribe,
    emitStatus: (status: DeviceStatus) => statusListener?.(status),
    emitDeviceChange: () => deviceChangeListener?.()
  };
}

describe('RendererDeviceRuntime', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes from cached status and enumerates supported catalog devices', async () => {
    const { runtime, eventBus, statusPort, mediaDevicesPort, devicePreferenceStore } = createRuntime();

    await runtime.initialize();

    expect(statusPort.getStatus).toHaveBeenCalledTimes(1);
    expect(statusPort.refreshStatus).not.toHaveBeenCalled();
    expect(mediaDevicesPort.enumerateDevices).toHaveBeenCalledTimes(1);
    expect(runtime.getStatus()).toEqual(connectedStatus);
    expect(runtime.isConnected).toBe(true);
    expect(runtime.selectedDeviceId).toBe(CHROMATIC_SPECS.deviceId);
    expect(runtime.snapshot().supportedDevices).toHaveLength(1);
    expect(devicePreferenceStore.storeDeviceId).toHaveBeenCalledWith(CHROMATIC_SPECS.deviceId, CHROMATIC_SPECS.id);
    expect(eventBus.publish).toHaveBeenCalledWith(EventChannels.DEVICE.STATUS_CHANGED, connectedStatus);
    expect(eventBus.publish).toHaveBeenCalledWith(
      EventChannels.DEVICE.SUPPORTED_DEVICE_AVAILABLE,
      expect.objectContaining({ device: expect.objectContaining({ deviceId: CHROMATIC_SPECS.deviceId }) })
    );
  });

  it('rolls back subscriptions and retries when the initial status refresh fails', async () => {
    const {
      runtime,
      statusPort,
      mediaDevicesPort,
      statusUnsubscribe,
      deviceChangeUnsubscribe,
      emitStatus,
      emitDeviceChange
    } = createRuntime();
    const initialError = new Error('status unavailable');
    statusPort.getStatus.mockRejectedValueOnce(initialError);

    await expect(runtime.initialize()).rejects.toThrow(initialError);

    expect(statusUnsubscribe).toHaveBeenCalledTimes(1);
    expect(deviceChangeUnsubscribe).toHaveBeenCalledTimes(1);

    emitStatus(disconnectedStatus);
    emitDeviceChange();

    expect(statusPort.refreshStatus).not.toHaveBeenCalled();
    expect(runtime.getStatus().state).toBe('unknown');

    await runtime.initialize();

    expect(statusPort.subscribe).toHaveBeenCalledTimes(2);
    expect(mediaDevicesPort.subscribeDeviceChange).toHaveBeenCalledTimes(2);
    expect(runtime.getStatus()).toEqual(connectedStatus);
    expect(runtime.isConnected).toBe(true);
  });

  it('uses the manual refresh port for explicit refreshStatus calls', async () => {
    const { runtime, statusPort } = createRuntime();
    await runtime.initialize();
    statusPort.refreshStatus.mockResolvedValue(disconnectedStatus);

    const status = await runtime.refreshStatus();

    expect(status).toEqual(disconnectedStatus);
    expect(statusPort.refreshStatus).toHaveBeenCalledTimes(1);
    expect(runtime.isConnected).toBe(false);
  });

  it('updates from pushed status without calling manual refresh', async () => {
    const { runtime, statusPort, emitStatus } = createRuntime();
    await runtime.initialize();
    statusPort.refreshStatus.mockClear();

    emitStatus(disconnectedStatus);
    await vi.waitFor(() => expect(runtime.getStatus()).toEqual(disconnectedStatus));

    expect(statusPort.refreshStatus).not.toHaveBeenCalled();
  });

  it('refreshes through the manual reconciliation path after browser devicechange', async () => {
    const { runtime, statusPort, emitDeviceChange } = createRuntime();
    await runtime.initialize();
    statusPort.refreshStatus.mockResolvedValue(disconnectedStatus);

    emitDeviceChange();
    await vi.waitFor(() => expect(runtime.getStatus()).toEqual(disconnectedStatus));

    expect(statusPort.refreshStatus).toHaveBeenCalledTimes(1);
  });

  it('selectDevice persists only catalog-supported devices', () => {
    const { runtime, devicePreferenceStore } = createRuntime();

    expect(runtime.selectDevice(createMediaDevice({ deviceId: 'selected-camera' }))).toBe(true);
    expect(runtime.selectedDeviceId).toBe('selected-camera');
    expect(devicePreferenceStore.storeDeviceId).toHaveBeenCalledWith('selected-camera', CHROMATIC_SPECS.id);

    expect(runtime.selectDevice(createMediaDevice({ deviceId: 'unsupported', label: 'Integrated Camera' }))).toBe(false);
    expect(runtime.selectedDeviceId).toBe('selected-camera');
  });

  it('publishes disconnected-during-session when a connected runtime receives a disconnected push', async () => {
    const { runtime, eventBus, emitStatus } = createRuntime();
    await runtime.initialize();
    eventBus.publish.mockClear();

    emitStatus(disconnectedStatus);
    await vi.waitFor(() => {
      expect(eventBus.publish).toHaveBeenCalledWith(EventChannels.DEVICE.DISCONNECTED_DURING_SESSION);
    });
  });

  it('does not accept pushed or in-flight refresh commits once disposal starts', async () => {
    const {
      runtime,
      eventBus,
      statusPort,
      mediaDevicesPort,
      devicePreferenceStore,
      statusUnsubscribe,
      deviceChangeUnsubscribe,
      emitStatus,
      emitDeviceChange
    } = createRuntime();
    await runtime.initialize();
    eventBus.publish.mockClear();
    devicePreferenceStore.storeDeviceId.mockClear();

    const pendingEnumeration = createDeferred<MediaDeviceInfo[]>();
    statusPort.refreshStatus.mockResolvedValue(disconnectedStatus);
    mediaDevicesPort.enumerateDevices.mockImplementationOnce(() => pendingEnumeration.promise);

    const refreshPromise = runtime.refresh('manual-refresh');
    await vi.waitFor(() => expect(statusPort.refreshStatus).toHaveBeenCalledTimes(1));

    const disposePromise = runtime.dispose();

    expect(statusUnsubscribe).toHaveBeenCalledTimes(1);
    expect(deviceChangeUnsubscribe).toHaveBeenCalledTimes(1);

    emitStatus(disconnectedStatus);
    emitDeviceChange();
    pendingEnumeration.resolve([createMediaDevice({ deviceId: 'late-camera' })]);

    await expect(refreshPromise).resolves.toEqual(expect.objectContaining({ status: connectedStatus }));
    await expect(disposePromise).resolves.toBeUndefined();

    expect(runtime.getStatus()).toEqual(connectedStatus);
    expect(statusPort.refreshStatus).toHaveBeenCalledTimes(1);
    expect(devicePreferenceStore.storeDeviceId).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalledWith(EventChannels.DEVICE.STATUS_CHANGED, disconnectedStatus);
    expect(runtime.selectedDeviceId).toBe(CHROMATIC_SPECS.deviceId);
  });
});
