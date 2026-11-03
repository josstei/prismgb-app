
import { BaseService, disposeInOrder, getErrorMessage } from '@platform/core';
import { EventChannels } from '@platform/events';
import type { TypedEventBusLike } from '@platform/events';
import type { DisposableFunction, LoggerFactoryLike } from '@platform/core';

import {
  getDeviceAcquisitionProfile,
  getDeviceStreamProfile
} from '@platform/devices';
import type {
  DeviceAcquisitionProfile,
  DeviceDescriptor,
  DeviceStatus,
  DeviceStreamProfile
} from '@platform/devices';
import type { DevicePreferenceStore } from './storage-device-preference.store.js';
import type { DeviceStatusPort } from './trpc-device-status.port.js';
import type { MediaDevicesPort } from './browser-media-devices.port.js';
import {
  getDeviceDescriptor,
  labelsAreHidden,
  selectDevice
} from './device-selection.utils.js';

interface RendererDeviceSnapshot {
  status: DeviceStatus;
  supportedDevices: readonly MediaDeviceInfo[];
  selectedDeviceId: string | null;
  hasMediaPermission: boolean;
}

export interface DeviceStreamingTarget {
  videoDevice: MediaDeviceInfo;
  audioDevice: MediaDeviceInfo | null;
  descriptor: DeviceDescriptor;
  profile: DeviceStreamProfile;
  acquisition: DeviceAcquisitionProfile;
}

type RendererDeviceRefreshReason =
  | 'initial'
  | 'ipc-connected'
  | 'ipc-disconnected'
  | 'browser-devicechange'
  | 'manual-refresh';

const UNKNOWN_STATUS: DeviceStatus = Object.freeze({
  state: 'unknown',
  connected: false,
  device: null
});

function statusChanged(previous: DeviceStatus, next: DeviceStatus): boolean {
  return previous.state !== next.state ||
    previous.connected !== next.connected ||
    previous.device?.id !== next.device?.id ||
    previous.device?.vendorId !== next.device?.vendorId ||
    previous.device?.productId !== next.device?.productId ||
    previous.error !== next.error;
}

function stopStreamTracks(stream: MediaStream | null): void {
  if (!stream) {
    return;
  }

  for (const track of stream.getTracks()) {
    track.stop();
  }
}

type RendererDeviceRuntimeDependencies = {
  deviceStatusPort: DeviceStatusPort;
  mediaDevicesPort: MediaDevicesPort;
  devicePreferenceStore: DevicePreferenceStore;
  eventBus: TypedEventBusLike;
  loggerFactory: LoggerFactoryLike;
};

export class RendererDeviceRuntime extends BaseService {
  private acceptingRefreshes = true;
  private initializePromise: Promise<void> | null = null;
  private permissionProbeInFlight: Promise<void> | null = null;
  private initialized = false;
  private currentSnapshot: RendererDeviceSnapshot = {
    status: UNKNOWN_STATUS,
    supportedDevices: [],
    selectedDeviceId: null,
    hasMediaPermission: false
  };
  private refreshQueue: Promise<RendererDeviceSnapshot> = Promise.resolve(this.currentSnapshot);

  private readonly deviceStatusPort: DeviceStatusPort;
  private readonly mediaDevicesPort: MediaDevicesPort;
  private readonly devicePreferenceStore: DevicePreferenceStore;
  private readonly eventBus: TypedEventBusLike;

  constructor({ deviceStatusPort, mediaDevicesPort, devicePreferenceStore, eventBus, loggerFactory }: RendererDeviceRuntimeDependencies) {
    super({ loggerFactory, eventBus }, 'RendererDeviceRuntime');
    this.deviceStatusPort = deviceStatusPort;
    this.mediaDevicesPort = mediaDevicesPort;
    this.devicePreferenceStore = devicePreferenceStore;
    this.eventBus = eventBus;
  }

  get isConnected(): boolean {
    return this.currentSnapshot.status.connected;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.initializePromise = this.initializeRuntime();
    try {
      await this.initializePromise;
    } finally {
      this.initializePromise = null;
    }
  }

  private async initializeRuntime(): Promise<void> {
    if (!this.acceptingRefreshes) {
      return;
    }

    const subscriptions: DisposableFunction[] = [];
    try {
      subscriptions.push(this.track(this.deviceStatusPort.subscribe((status) => {
        if (!this.acceptingRefreshes) return;
        const reason: RendererDeviceRefreshReason = status.connected ? 'ipc-connected' : 'ipc-disconnected';
        void this.enqueueRefresh(() => this.performRefresh(reason, status), true).catch((error) => {
          this.logger.error('IPC device status refresh failed:', error);
        });
      })));
      subscriptions.push(this.track(this.mediaDevicesPort.subscribeDeviceChange(() => {
        if (!this.acceptingRefreshes) return;
        void this.enqueueRefresh(() => this.performRefresh('browser-devicechange'), true).catch((error) => {
          this.logger.error('Browser devicechange refresh failed:', error);
        });
      })));
      await this.refresh('initial');
      if (this.acceptingRefreshes) {
        this.initialized = true;
        // Events received during the initial query run after its snapshot, rather
        // than being lost or overwriting a later observation with that snapshot.
        await this.refreshQueue;
      }
    } catch (error) {
      this.initialized = false;
      await disposeInOrder(subscriptions.reverse()).catch((cleanupError) => {
        this.logger.error('Device initialization rollback failed:', cleanupError);
      });
      throw error;
    }
  }

  private refresh(reason: RendererDeviceRefreshReason): Promise<RendererDeviceSnapshot> {
    return this.enqueueRefresh(() => this.performRefresh(reason));
  }

  async resolveStreamingTarget(deviceId: string | null = null, signal?: AbortSignal): Promise<DeviceStreamingTarget> {
    this.assertAcceptingTarget(signal);
    const snapshot = await this.refresh('manual-refresh');
    this.assertAcceptingTarget(signal);
    const selectedDevice = deviceId
      ? this.findSupportedDevice(snapshot, deviceId)
      : this.findSelectedDevice(snapshot);

    if (selectedDevice) {
      return this.createStreamingTarget(selectedDevice, signal);
    }

    if (!deviceId && snapshot.status.connected && !snapshot.hasMediaPermission) {
      await this.warmUpPermissions();
      this.assertAcceptingTarget(signal);
      const permissionSnapshot = await this.refresh('manual-refresh');
      this.assertAcceptingTarget(signal);
      const permissionDevice = this.findSelectedDevice(permissionSnapshot);
      if (permissionDevice) {
        return this.createStreamingTarget(permissionDevice, signal);
      }
    }

    const devices = await this.enumerateMediaDevices('manual-refresh');
    this.assertAcceptingTarget(signal);
    const videoDevices = devices.filter((device) => device.kind === 'videoinput');
    const requestedDevice = deviceId
      ? videoDevices.find((device) => device.deviceId === deviceId) ?? null
      : null;

    if (deviceId) {
      if (requestedDevice && getDeviceDescriptor(requestedDevice)) {
        return this.createStreamingTarget(requestedDevice, signal);
      }
      throw new Error(`Device not found: ${deviceId}`);
    }

    if (videoDevices.length > 0 && videoDevices.every((device) => !device.label)) {
      throw new Error('Supported device camera not authorized. Please grant permission and retry.');
    }

    throw new Error('No supported device found');
  }

  private assertAcceptingTarget(signal?: AbortSignal): void {
    signal?.throwIfAborted();
    if (!this.acceptingRefreshes) throw new Error('Device runtime is not accepting refreshes');
  }

  override async dispose(): Promise<void> {
    this.acceptingRefreshes = false;
    this.initialized = false;
    await super.dispose();
    await this.initializePromise?.catch(() => undefined);
    await this.refreshQueue.catch(() => undefined);
  }

  private enqueueRefresh(operation: () => Promise<RendererDeviceSnapshot>, requiresInitialization = false): Promise<RendererDeviceSnapshot> {
    if (!this.acceptingRefreshes) {
      return Promise.resolve(this.currentSnapshot);
    }

    const next = this.refreshQueue
      .catch(() => this.currentSnapshot)
      .then(() => this.acceptingRefreshes && (!requiresInitialization || this.initialized) ? operation() : this.currentSnapshot);

    this.refreshQueue = next.catch(() => this.currentSnapshot);
    return next;
  }

  private async performRefresh(
    reason: RendererDeviceRefreshReason,
    incomingStatus?: DeviceStatus
  ): Promise<RendererDeviceSnapshot> {
    const status = incomingStatus ?? await this.getStatusForReason(reason);
    const devices = await this.enumerateMediaDevices(reason);
    const storedDeviceIds = this.devicePreferenceStore.readStoredDeviceIds();
    const selection = selectDevice({ devices, storedDeviceIds });
    const hasMediaPermission = selection.supportedDevices.length > 0 ||
      devices.some((device) => device.kind === 'videoinput' && Boolean(device.label));

    if (!this.acceptingRefreshes) {
      return this.currentSnapshot;
    }

    if (selection.selectedDevice && selection.descriptor) {
      this.devicePreferenceStore.storeDeviceId(selection.selectedDevice.deviceId, selection.descriptor.id);
    }

    const nextSnapshot: RendererDeviceSnapshot = {
      status,
      supportedDevices: selection.supportedDevices,
      selectedDeviceId: selection.selectedDevice?.deviceId ?? null,
      hasMediaPermission
    };

    this.commitSnapshot(reason, nextSnapshot);
    return this.currentSnapshot;
  }

  private async getStatusForReason(reason: RendererDeviceRefreshReason): Promise<DeviceStatus> {
    if (reason === 'manual-refresh' || reason === 'browser-devicechange') {
      return this.deviceStatusPort.refreshStatus();
    }

    return this.deviceStatusPort.getStatus();
  }

  private async enumerateMediaDevices(reason: RendererDeviceRefreshReason): Promise<MediaDeviceInfo[]> {
    try {
      return await this.mediaDevicesPort.enumerateDevices();
    } catch (error) {
      const message = getErrorMessage(error, 'Enumeration failed');
      this.logger.warn('Could not enumerate media devices:', message);
      if (this.acceptingRefreshes) {
        this.eventBus.publish(EventChannels.DEVICE.ENUMERATION_FAILED, {
          error: message,
          reason
        });
      }
      return [];
    }
  }

  private commitSnapshot(
    reason: RendererDeviceRefreshReason,
    nextSnapshot: RendererDeviceSnapshot
  ): void {
    if (!this.acceptingRefreshes) {
      return;
    }

    const previousSnapshot = this.currentSnapshot;
    this.currentSnapshot = nextSnapshot;

    if (statusChanged(previousSnapshot.status, nextSnapshot.status)) {
      this.logger.info(`Device status: ${nextSnapshot.status.connected ? 'CONNECTED' : 'DISCONNECTED'}`);
      this.eventBus.publish(EventChannels.DEVICE.STATUS_CHANGED, nextSnapshot.status);
      if (
        !nextSnapshot.status.connected &&
        previousSnapshot.status.connected &&
        (reason === 'ipc-disconnected' || reason === 'browser-devicechange')
      ) {
        this.eventBus.publish(EventChannels.DEVICE.DISCONNECTED_DURING_SESSION);
      }
    }

    for (const device of nextSnapshot.supportedDevices) {
      if (!previousSnapshot.supportedDevices.some((previous) => previous.deviceId === device.deviceId)) {
        this.eventBus.publish(EventChannels.DEVICE.SUPPORTED_DEVICE_AVAILABLE, {
          device,
          videoDevices: [...nextSnapshot.supportedDevices]
        });
      }
    }
  }

  private mergeSupportedDevice(device: MediaDeviceInfo): readonly MediaDeviceInfo[] {
    const withoutDuplicate = this.currentSnapshot.supportedDevices
      .filter((knownDevice) => knownDevice.deviceId !== device.deviceId);
    return [device, ...withoutDuplicate];
  }

  private findSupportedDevice(snapshot: RendererDeviceSnapshot, deviceId: string): MediaDeviceInfo | null {
    return snapshot.supportedDevices.find((device) => device.deviceId === deviceId) ?? null;
  }

  private findSelectedDevice(snapshot: RendererDeviceSnapshot): MediaDeviceInfo | null {
    return snapshot.selectedDeviceId ? this.findSupportedDevice(snapshot, snapshot.selectedDeviceId) : null;
  }

  private commitStreamingSelection(device: MediaDeviceInfo, descriptor: DeviceDescriptor): void {
    this.devicePreferenceStore.storeDeviceId(device.deviceId, descriptor.id);
    this.currentSnapshot = {
      ...this.currentSnapshot,
      supportedDevices: this.mergeSupportedDevice(device),
      selectedDeviceId: device.deviceId,
      hasMediaPermission: Boolean(device.label) || this.currentSnapshot.hasMediaPermission
    };
  }

  private async createStreamingTarget(device: MediaDeviceInfo, signal?: AbortSignal): Promise<DeviceStreamingTarget> {
    if (!device.deviceId) {
      throw new Error('Streaming target requires a media device ID');
    }

    const descriptor = getDeviceDescriptor(device);
    if (!descriptor) {
      throw new Error(`Unsupported device: ${device.label || device.deviceId || 'unknown'}`);
    }

    const audioDevice = await this.resolvePairedAudioDevice(device);
    this.assertAcceptingTarget(signal);
    this.commitStreamingSelection(device, descriptor);

    return {
      videoDevice: device,
      audioDevice,
      descriptor,
      profile: getDeviceStreamProfile(descriptor),
      acquisition: getDeviceAcquisitionProfile(descriptor)
    };
  }

  private async resolvePairedAudioDevice(device: MediaDeviceInfo): Promise<MediaDeviceInfo | null> {
    if (!device.groupId) {
      return null;
    }

    try {
      const devices = await this.mediaDevicesPort.enumerateDevices();
      return devices.find((candidate) => (
        candidate.kind === 'audioinput' &&
        candidate.groupId === device.groupId &&
        Boolean(candidate.deviceId)
      )) ?? null;
    } catch (error) {
      this.logger.warn('Failed to enumerate paired audio devices:', getErrorMessage(error));
      return null;
    }
  }

  private async warmUpPermissions(): Promise<void> {
    if (this.permissionProbeInFlight) {
      return this.permissionProbeInFlight;
    }

    this.permissionProbeInFlight = (async () => {
      let stream: MediaStream | null = null;
      try {
        const devices = await this.mediaDevicesPort.enumerateDevices();
        if (!labelsAreHidden(devices)) {
          return;
        }

        stream = await this.mediaDevicesPort.getUserMedia({ video: true });
      } catch (error) {
        this.logger.debug('Permission warm-up failed:', getErrorMessage(error, 'Permission denied'));
      } finally {
        stopStreamTracks(stream);
        this.permissionProbeInFlight = null;
      }
    })();

    return this.permissionProbeInFlight;
  }
}
