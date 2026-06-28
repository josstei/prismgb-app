import { EventEmitter } from 'node:events';

export type IpcPushChannelListener = (payload: unknown) => void;

/**
 * In-process fan-out for main → renderer push channels.
 *
 * `WindowService.send` (and through it the device/update/transcode package emitters) publishes here
 * instead of calling `webContents.send` directly; the tRPC router's subscription procedures consume
 * the same channels via {@link IpcPushBridge.on} and relay payloads to renderer clients. Decoupling
 * the emit side from the transport preserves the existing single-funnel emit path while the tRPC
 * boundary owns delivery.
 */
export class IpcPushBridge {
  private static readonly MAX_LISTENERS_PER_CHANNEL = 50;
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(IpcPushBridge.MAX_LISTENERS_PER_CHANNEL);
  }

  emit(channel: string, payload?: unknown): void {
    this.emitter.emit(channel, payload);
  }

  on(channel: string, listener: IpcPushChannelListener): void {
    this.emitter.on(channel, listener);
  }

  off(channel: string, listener: IpcPushChannelListener): void {
    this.emitter.off(channel, listener);
  }
}
