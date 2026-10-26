import { EventEmitter } from 'node:events';
import type { IpcPushPublisher, IpcPushPayloadMap, IpcPushArguments } from '@platform/ipc';

type IpcPushChannelListener = (payload: unknown) => void;

export class IpcPushBridge implements IpcPushPublisher {
  private static readonly MAX_LISTENERS_PER_CHANNEL = 50;
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(IpcPushBridge.MAX_LISTENERS_PER_CHANNEL);
  }

  emit<K extends keyof IpcPushPayloadMap>(...args: IpcPushArguments<K>): void {
    this.emitter.emit(args[0], args[1]);
  }

  /** Test-control ingress intentionally accepts malformed payloads to exercise IPC validation. */
  emitUnchecked(channel: string, payload?: unknown): void {
    this.emitter.emit(channel, payload);
  }

  dispose(): void {
    this.emitter.removeAllListeners();
  }

  on(channel: string, listener: IpcPushChannelListener): void {
    this.emitter.on(channel, listener);
  }

  off(channel: string, listener: IpcPushChannelListener): void {
    this.emitter.off(channel, listener);
  }
}
