import { TIMING } from '@platform/config';
import { DeviceCatalog } from '@platform/devices';
import type { DeviceId, DeviceInfoPayload, DeviceStatus, DeviceStatusPayload } from '@platform/devices';
import { debounce } from '@platform/core';
import type { LoggerLike, StorageServiceLike } from '@platform/core';
import { createTrpcEventBridge } from '@renderer/infrastructure/services/platform/trpc-event-bridge.factory';
import { trpcClient, type RendererTrpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import { callIpc } from '@renderer/infrastructure/ipc/call-ipc.js';

export type DeviceStatusListener = (status: DeviceStatus) => void;

const noopLogger: LoggerLike = {
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {}
};

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

function toErrorStatus(error: string): DeviceStatus {
  return {
    state: 'error',
    connected: false,
    device: null,
    error,
    updatedAt: now()
  };
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
  private readonly logger: LoggerLike;

  constructor(client: RendererTrpcClient = trpcClient, logger?: LoggerLike) {
    this.client = client;
    this.logger = logger ?? noopLogger;
  }

  async getStatus(): Promise<DeviceStatus> {
    const result = await callIpc(
      'device.getStatus',
      () => this.client.device.getStatus.query() as Promise<DeviceStatusPayload>,
      this.logger
    );
    if (result.status === 'ok') {
      return toStatusFromPayload(result.value);
    }
    return toErrorStatus(result.error);
  }

  async refreshStatus(): Promise<DeviceStatus> {
    const result = await callIpc(
      'device.refreshStatus',
      () => this.client.device.refreshStatus.mutate() as Promise<DeviceStatusPayload>,
      this.logger
    );
    if (result.status === 'ok') {
      return toStatusFromPayload(result.value);
    }
    return toErrorStatus(result.error);
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
