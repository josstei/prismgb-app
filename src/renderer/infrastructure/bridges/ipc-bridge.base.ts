/**
 * IPC Bridge Base Class
 *
 * Abstract base class for services that bridge window.*API (preload IPC) with EventBus.
 * Captures the common pattern of:
 * 1. Subscribing to window.*API events in onInitialize
 * 2. Forwarding events to EventBus (with optional transformation)
 * 3. Cleaning up via removeListeners in onDispose
 *
 * Subclasses must implement:
 * - getIPCApi(): Return the window.*API object (e.g., window.transcodeAPI)
 * - getMappings(): Return array of IPC event → EventBus mappings
 *
 * Subclasses can optionally override:
 * - createHandler(mapping): Custom handler creation for state management
 */

import { LifecycleService } from '@prismgb/core';
import type { EventBusLike } from '@prismgb/core/types';

export interface IPCMapping {
  apiMethod: string;
  eventChannel: string;
  transform?: (data: unknown) => unknown;
}

export interface IPCApi {
  removeListeners?: () => void;
  [key: string]: ((...args: unknown[]) => void) | undefined;
}

export abstract class IPCBridgeBase extends LifecycleService {
  protected abstract getIPCApi(): IPCApi | undefined;
  protected abstract getMappings(): IPCMapping[];

  async onInitialize(): Promise<void> {
    const api = this.getIPCApi();
    if (!api) {
      this.logger.warn(`IPC API not available for ${this._serviceName}`);
      return;
    }

    for (const mapping of this.getMappings()) {
      const handler = this.createHandler(mapping);
      const apiMethod = api[mapping.apiMethod];

      if (typeof apiMethod === 'function') {
        const unsubscribe = apiMethod(handler);
        if (typeof unsubscribe === 'function') {
          this._subscriptions.push(unsubscribe);
        }
      } else {
        this.logger.warn(`IPC method ${mapping.apiMethod} not found on API`);
      }
    }
  }

  protected createHandler(mapping: IPCMapping): (data: unknown) => void {
    return (data: unknown) => {
      const payload = mapping.transform ? mapping.transform(data) : data;
      (this.eventBus as EventBusLike).publish(mapping.eventChannel, payload);
    };
  }

  async onDispose(): Promise<void> {
    const api = this.getIPCApi();
    if (api?.removeListeners) {
      api.removeListeners();
    }
  }
}
