import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventChannels } from '@platform/events';
import { RendererDeviceRuntime } from '@renderer/infrastructure/services/devices/device-runtime.service';
import { createEventBus, createLoggerFactory } from '../../../../factories/index.js';
import type { DeviceStatus } from '@platform/devices';
import {
  CHROMATIC_SPECS,
  createChromaticVideoDeviceInfo
} from '../../../../devices/media.testkit';
import { createChromaticDeviceInfoPayload } from '../../../../devices/media.testkit';

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

function createAudioDevice(overrides: Partial<MediaDeviceInfo> = {}): MediaDeviceInfo {
  return createChromaticVideoDeviceInfo({
    deviceId: CHROMATIC_SPECS.audioDeviceId,
    groupId: CHROMATIC_SPECS.groupId,
    kind: 'audioinput',
    label: `${CHROMATIC_SPECS.label} Audio`,
    ...overrides
  });
}

function createPermissionStream() {
  const track = { stop: vi.fn() };
  return {
    stream: {
      getTracks: vi.fn(() => [track])
    } as unknown as MediaStream,
    track
  };
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

function createRuntime(options: {
  devices?: MediaDeviceInfo[];
  storedDeviceIds?: string[];
  status?: DeviceStatus;
} = {}) {
  let statusListener: ((status: DeviceStatus) => void) | null = null;
  let deviceChangeListener: (() => void) | null = null;
  const initialStatus = options.status ?? connectedStatus;
  const initialDevices = options.devices ?? [createMediaDevice()];
  const eventBus = createEventBus();
  const loggerFactory = createLoggerFactory();
  const statusUnsubscribe = vi.fn(() => {
    statusListener = null;
  });
  const deviceChangeUnsubscribe = vi.fn(() => {
    deviceChangeListener = null;
  });
  const statusPort = {
    getStatus: vi.fn(async () => initialStatus),
    refreshStatus: vi.fn(async () => initialStatus),
    subscribe: vi.fn((listener: (status: DeviceStatus) => void) => {
      statusListener = listener;
      return statusUnsubscribe;
    })
  };
  const mediaDevicesPort = {
    enumerateDevices: vi.fn(async () => initialDevices),
    getUserMedia: vi.fn(),
    subscribeDeviceChange: vi.fn((listener: () => void) => {
      deviceChangeListener = listener;
      return deviceChangeUnsubscribe;
    })
  };
  const devicePreferenceStore = {
    readStoredDeviceIds: vi.fn(() => options.storedDeviceIds ?? []),
    storeDeviceId: vi.fn()
  };
  const runtime = new RendererDeviceRuntime(
    statusPort,
    mediaDevicesPort,
    devicePreferenceStore,
    eventBus,
    loggerFactory,
    () => 100
  );

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

  it('resolves an explicit streaming target with paired audio and catalog profiles', async () => {
    const videoDevice = createMediaDevice({ deviceId: 'selected-camera' });
    const audioDevice = createAudioDevice();
    const { runtime, devicePreferenceStore } = createRuntime({
      devices: [videoDevice, audioDevice]
    });

    const target = await runtime.resolveStreamingTarget('selected-camera');

    expect(target.videoDevice).toBe(videoDevice);
    expect(target.audioDevice).toBe(audioDevice);
    expect(target.descriptor.id).toBe(CHROMATIC_SPECS.id);
    expect(target.profile.canvasResolution).toEqual({ width: 640, height: 576, scale: 4 });
    expect(target.acquisition.attempts.map((attempt) => attempt.strategy)).toEqual([
      'full',
      'simple',
      'minimal',
      'video-only-simple',
      'video-only-minimal'
    ]);
    expect(runtime.selectedDeviceId).toBe('selected-camera');
    expect(devicePreferenceStore.storeDeviceId).toHaveBeenCalledWith('selected-camera', CHROMATIC_SPECS.id);
  });

  it('resolves the currently selected streaming target', async () => {
    const videoDevice = createMediaDevice({ deviceId: 'selected-camera' });
    const { runtime } = createRuntime({ devices: [videoDevice] });

    await runtime.initialize();
    const target = await runtime.resolveStreamingTarget();

    expect(target.videoDevice).toBe(videoDevice);
  });

  it('restores the first valid stored device when earlier stored IDs are stale', async () => {
    const videoDevice = createMediaDevice({ deviceId: 'valid-stored-camera' });
    const { runtime } = createRuntime({
      devices: [videoDevice],
      storedDeviceIds: ['stale-camera', 'valid-stored-camera']
    });

    const target = await runtime.resolveStreamingTarget();

    expect(target.videoDevice.deviceId).toBe('valid-stored-camera');
  });

  it('resolves a visible catalog label match without stored IDs', async () => {
    const videoDevice = createMediaDevice({
      deviceId: 'visible-camera',
      label: 'USB ModRetro Chromatic Camera'
    });
    const { runtime } = createRuntime({ devices: [videoDevice] });

    const target = await runtime.resolveStreamingTarget();

    expect(target.videoDevice.deviceId).toBe('visible-camera');
  });

  it('warms permissions, cleans up probe tracks, and resolves target when hidden labels become visible', async () => {
    const hiddenDevice = createMediaDevice({ deviceId: 'hidden-camera', label: '' });
    const visibleDevice = createMediaDevice({ deviceId: 'visible-camera' });
    const audioDevice = createAudioDevice();
    const { stream, track } = createPermissionStream();
    const { runtime, mediaDevicesPort } = createRuntime({ devices: [hiddenDevice] });
    mediaDevicesPort.enumerateDevices
      .mockResolvedValueOnce([hiddenDevice])
      .mockResolvedValueOnce([hiddenDevice])
      .mockResolvedValueOnce([visibleDevice, audioDevice])
      .mockResolvedValueOnce([visibleDevice, audioDevice]);
    mediaDevicesPort.getUserMedia.mockResolvedValue(stream);

    const target = await runtime.resolveStreamingTarget();

    expect(mediaDevicesPort.getUserMedia).toHaveBeenCalledWith({ video: true });
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(target.videoDevice).toBe(visibleDevice);
    expect(target.audioDevice).toBe(audioDevice);
  });

  it('throws the authorization error when hidden labels remain hidden after permission denial', async () => {
    const hiddenDevice = createMediaDevice({ deviceId: 'hidden-camera', label: '' });
    const { runtime, mediaDevicesPort } = createRuntime({ devices: [hiddenDevice] });
    mediaDevicesPort.enumerateDevices
      .mockResolvedValueOnce([hiddenDevice])
      .mockResolvedValueOnce([hiddenDevice])
      .mockResolvedValueOnce([hiddenDevice])
      .mockResolvedValueOnce([hiddenDevice]);
    mediaDevicesPort.getUserMedia.mockRejectedValue(new Error('denied'));

    await expect(runtime.resolveStreamingTarget()).rejects.toThrow('Supported device camera not authorized');
  });

  it('throws no-supported-device for unsupported visible cameras', async () => {
    const { runtime } = createRuntime({
      devices: [createMediaDevice({ deviceId: 'integrated-camera', label: 'Integrated Camera' })]
    });

    await expect(runtime.resolveStreamingTarget()).rejects.toThrow('No supported device found');
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
