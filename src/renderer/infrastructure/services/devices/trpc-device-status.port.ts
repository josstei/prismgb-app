import type { DeviceInfoPayload, DeviceStatus, DeviceStatusPayload } from '@platform/devices';
import type { LoggerLike } from '@platform/core';
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
