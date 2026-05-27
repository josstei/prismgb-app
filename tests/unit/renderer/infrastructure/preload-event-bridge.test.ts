import { describe, expect, it, vi } from 'vitest';
import { createManifestPreloadEventBridge, createPreloadEventBridge } from '@renderer/infrastructure/services/preload-event-bridge.factory';
import type { IpcManifest } from '@shared/ipc/ipc.manifest.js';
import {
  createCallbackMap,
  createLogger,
  createPreloadEventApiMock
} from '../../../factories/index.js';

const testManifest: IpcManifest = { version: 1, mode: 'enforced', namespaces: [{ namespace: 'TEST', apiName: 'testAPI', exposedMethods: ['onMappedAvailable', 'onMappedError'], subscriptions: [{ method: 'onAvailableInternal', factoryMethod: 'onMappedAvailable', channelKey: 'AVAILABLE', channel: 'test:available', payload: 'unknown' }, { method: 'onMappedError', channelKey: 'ERROR', channel: 'test:error', payload: 'unknown' }] }] };
const testDescriptor = { apiName: 'testAPI', bridgeName: 'TestBridge', methods: ['onMappedAvailable', 'onMappedError'] } as const;

describe('createPreloadEventBridge', () => {
  it('tracks unsubscribe closures returned by preload subscriptions', () => {
    const unsubscribeA = vi.fn(), unsubscribeB = vi.fn();
    const api = createPreloadEventApiMock({ onA: unsubscribeA, onB: unsubscribeB });
    const bridge = createPreloadEventBridge({ api, bridgeName: 'TestBridge', subscriptions: [{ id: 'a', subscribe: (preloadApi) => preloadApi.onA(() => {}) }, { id: 'b', subscribe: (preloadApi) => preloadApi.onB(() => {}) }] });
    expect(bridge.size).toBe(2);
    bridge.dispose();
    bridge.dispose();
    expect(unsubscribeB).toHaveBeenCalledTimes(1);
    expect(unsubscribeA).toHaveBeenCalledTimes(1);
  });

  it('warns when a preload subscription does not return an unsubscribe function', () => {
    const logger = createLogger({ name: 'PreloadEventBridge' });
    const api = createPreloadEventApiMock({ onMissing: undefined });
    const bridge = createPreloadEventBridge({ api, bridgeName: 'TestBridge', logger, subscriptions: [{ id: 'missing', subscribe: (preloadApi) => preloadApi.onMissing(() => {}) }] });
    expect(bridge.size).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith('TestBridge: subscription "missing" did not return an unsubscribe function');
  });
});

describe('createManifestPreloadEventBridge', () => {
  it('derives preload subscriptions from manifest metadata and factoryMethod', () => {
    const unsubscribeA = vi.fn(), unsubscribeB = vi.fn();
    const api = createPreloadEventApiMock({ onMappedAvailable: unsubscribeA, onMappedError: unsubscribeB });
    const handlers = createCallbackMap(['onMappedAvailable', 'onMappedError']);
    const bridge = createManifestPreloadEventBridge({ api, descriptor: testDescriptor, bridgeName: 'TestBridge', handlers, manifest: testManifest });
    expect(api.onMappedAvailable).toHaveBeenCalledWith(handlers.onMappedAvailable);
    expect(api.onMappedError).toHaveBeenCalledWith(handlers.onMappedError);
    expect(bridge.size).toBe(2);
    bridge.dispose();
    expect(unsubscribeB).toHaveBeenCalledTimes(1);
    expect(unsubscribeA).toHaveBeenCalledTimes(1);
  });

  it('fails closed when a manifest subscription handler is missing', () => {
    const incompleteHandlers = createCallbackMap(['onMappedAvailable']);
    const api = createPreloadEventApiMock({ onMappedAvailable: vi.fn(), onMappedError: vi.fn() });
    expect(() => createManifestPreloadEventBridge({ api, descriptor: testDescriptor, bridgeName: 'TestBridge', handlers: incompleteHandlers, manifest: testManifest })).toThrow('TestBridge: preload event handler missing for "testAPI.onMappedError"');
  });

  it('fails closed when a manifest subscription method is missing on the preload API', () => {
    const api = createPreloadEventApiMock({ onMappedAvailable: vi.fn() });
    const handlers = createCallbackMap(['onMappedAvailable', 'onMappedError']);
    expect(() => createManifestPreloadEventBridge({ api, descriptor: testDescriptor, bridgeName: 'TestBridge', handlers, manifest: testManifest })).toThrow('TestBridge: preload API method "testAPI.onMappedError" is not available');
  });

  it('fails closed when bridge descriptors drift from manifest subscriptions', () => {
    const api = createPreloadEventApiMock({ onMappedAvailable: vi.fn() });
    const handlers = createCallbackMap(['onMappedAvailable']);

    expect(() => createManifestPreloadEventBridge({ api, descriptor: { apiName: 'testAPI', bridgeName: 'TestBridge', methods: ['onMappedAvailable'] } as const, handlers, manifest: testManifest })).toThrow('TestBridge: IPC manifest subscriptions missing from descriptor for "testAPI": onMappedError');
  });
});
