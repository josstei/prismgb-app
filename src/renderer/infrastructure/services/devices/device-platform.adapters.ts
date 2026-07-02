import { TIMING } from '@platform/config';
import { DeviceCatalog } from '@platform/devices';
import type { DeviceId, DeviceInfoPayload, DeviceStatus, DeviceStatusPayload } from '@platform/devices';
import type { IpcActionResult } from '@platform/ipc';
import { debounce } from '@platform/core';
import type { LoggerLike, StorageServiceLike } from '@platform/core';
import { createTrpcEventBridge } from '@renderer/infrastructure/services/platform/trpc-event-bridge.factory';
import { trpcClient, type RendererTrpcClient } from '@renderer/infrastructure/ipc/trpc-client';

export type DeviceStatusResponse = IpcActionResult & DeviceStatusPayload;
export type DeviceStatusListener = (status: DeviceStatus) => void;

export interface DeviceStatusPort {
  getStatus(): Promise<DeviceStatus>;
  refreshStatus(): Promise<DeviceStatus>;
  subscribe(onStatus: DeviceStatusListener): () => void;
}

export interface MediaDevicesPort {
  enumerateDevices(): Promise<MediaDeviceInfo[]>;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  subscribeDeviceChange(onChange: () => void): () => void;
}

export interface DevicePreferenceStore {
  readStoredDeviceIds(): readonly string[];
  storeDeviceId(deviceId: string, deviceIdKind: DeviceId): void;
}

type MediaDevicesEventSource = {
  addEventListener(event: 'devicechange', handler: () => void): void;
  removeEventListener(event: 'devicechange', handler: () => void): void;
};

type BrowserMediaServiceLike = MediaDevicesEventSource & {
  enumerateDevices(): Promise<MediaDeviceInfo[]>;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
};

function now(): number {
  return Date.now();
}

function toStatusFromPayload(payload: DeviceStatusPayload, updatedAt = now()): DeviceStatus {
  const status: DeviceStatus = {
    state: payload.state,
    connected: payload.connected,
    device: payload.device,
    updatedAt
  };

  if (payload.error !== undefined) {
    status.error = payload.error;
  }

  return status;
}

function toStatusFromResponse(response: DeviceStatusResponse): DeviceStatus {
  if (!response.success) {
    return {
      state: 'error',
      connected: false,
      device: null,
      error: response.error ?? 'Device status request failed',
      updatedAt: now()
    };
  }

  return toStatusFromPayload(response);
}

function toConnectionStatus(connected: boolean, device: DeviceInfoPayload | null | undefined): DeviceStatus {
  return {
    state: connected ? 'connected' : 'disconnected',
    connected,
    device: connected ? device ?? null : null,
    updatedAt: now()
  };
}

export class TrpcDeviceStatusPort implements DeviceStatusPort {
  private readonly client: RendererTrpcClient;
  private readonly logger?: LoggerLike;

  constructor(client: RendererTrpcClient = trpcClient, logger?: LoggerLike) {
    this.client = client;
    this.logger = logger;
  }

  async getStatus(): Promise<DeviceStatus> {
    return toStatusFromResponse(await this.client.device.getStatus.query() as DeviceStatusResponse);
  }

  async refreshStatus(): Promise<DeviceStatus> {
    return toStatusFromResponse(await this.client.device.refreshStatus.mutate() as DeviceStatusResponse);
  }

  subscribe(onStatus: DeviceStatusListener): () => void {
    const bridge = createTrpcEventBridge('TrpcDeviceStatusPort', [
      () => this.client.device.onConnected.subscribe(undefined, {
        onData: (device) => onStatus(toConnectionStatus(true, device))
      }),
      () => this.client.device.onDisconnected.subscribe(undefined, {
        onData: (device) => onStatus(toConnectionStatus(false, device))
      })
    ], this.logger);

    return () => bridge.dispose();
  }
}

export class BrowserMediaDevicesPort implements MediaDevicesPort {
  private readonly browserMediaService: BrowserMediaServiceLike;
  private readonly debounceMs: number;
  private readonly logger?: LoggerLike;

  constructor(
    browserMediaService: BrowserMediaServiceLike,
    logger?: LoggerLike,
    debounceMs = TIMING.DEVICE_CHANGE_DEBOUNCE_MS
  ) {
    this.browserMediaService = browserMediaService;
    this.logger = logger;
    this.debounceMs = debounceMs;
  }

  enumerateDevices(): Promise<MediaDeviceInfo[]> {
    return this.browserMediaService.enumerateDevices();
  }

  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
    return this.browserMediaService.getUserMedia(constraints);
  }

  subscribeDeviceChange(onChange: () => void): () => void {
    const handler = debounce(onChange, this.debounceMs);

    this.browserMediaService.addEventListener('devicechange', handler);
    this.logger?.debug(`Device change listener registered (debounce: ${this.debounceMs}ms)`);

    return () => {
      handler.cancel();
      this.browserMediaService.removeEventListener('devicechange', handler);
    };
  }
}

export class StorageDevicePreferenceStore implements DevicePreferenceStore {
  private readonly storageService: StorageServiceLike;
  private readonly logger?: LoggerLike;

  constructor(storageService: StorageServiceLike, logger?: LoggerLike) {
    this.storageService = storageService;
    this.logger = logger;
  }

  readStoredDeviceIds(): readonly string[] {
    const storedIds = DeviceCatalog.enabled()
      .map((descriptor) => this.getStoredDeviceId(descriptor.id))
      .filter((deviceId): deviceId is string => Boolean(deviceId));

    return Array.from(new Set(storedIds));
  }

  storeDeviceId(deviceId: string, deviceIdKind: DeviceId): void {
    try {
      if (!this.storageService.setItem(this.toStorageKey(deviceIdKind), deviceId)) {
        this.logger?.debug('Storage rejected device ID write');
      }
    } catch (error) {
      this.logger?.debug('Storage not available:', error);
    }
  }

  private getStoredDeviceId(deviceIdKind: DeviceId): string | null {
    try {
      return this.storageService.getItem(this.toStorageKey(deviceIdKind));
    } catch (error) {
      this.logger?.debug('Failed to get stored device ID:', error);
      return null;
    }
  }

  private toStorageKey(deviceIdKind: DeviceId): string {
    return `${deviceIdKind}_id`;
  }
}
