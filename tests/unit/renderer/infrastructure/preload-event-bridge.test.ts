import { describe, expect, it, vi } from 'vitest';
import { createManifestPreloadEventBridge, createPreloadEventBridge } from '@renderer/infrastructure/services/preload-event-bridge.factory';
import type { IpcManifest } from '@shared/ipc/ipc.manifest.js';
import { createLogger } from '../../../factories/index.js';

const testManifest: IpcManifest = { version: 1, mode: 'enforced', namespaces: [{ namespace: 'TEST', apiName: 'testAPI', exposedMethods: ['onMappedAvailable', 'onMappedError'], subscriptions: [{ method: 'onAvailableInternal', factoryMethod: 'onMappedAvailable', channelKey: 'AVAILABLE', channel: 'test:available', payload: 'unknown' }, { method: 'onMappedError', channelKey: 'ERROR', channel: 'test:error', payload: 'unknown' }] }] };
const testDescriptor = { apiName: 'testAPI', methods: ['onMappedAvailable', 'onMappedError'] } as const;

describe('createPreloadEventBridge', () => {
  it('tracks unsubscribe closures returned by preload subscriptions', () => {
    const unsubscribeA = vi.fn(), unsubscribeB = vi.fn();
    const api = { onA: vi.fn(() => unsubscribeA), onB: vi.fn(() => unsubscribeB) };
    const bridge = createPreloadEventBridge({ api, bridgeName: 'TestBridge', subscriptions: [{ id: 'a', subscribe: (preloadApi) => preloadApi.onA(() => {}) }, { id: 'b', subscribe: (preloadApi) => preloadApi.onB(() => {}) }] });
    expect(bridge.size).toBe(2);
    bridge.dispose();
    bridge.dispose();
    expect(unsubscribeB).toHaveBeenCalledTimes(1);
    expect(unsubscribeA).toHaveBeenCalledTimes(1);
  });

  it('warns when a preload subscription does not return an unsubscribe function', () => {
    const logger = createLogger({ name: 'PreloadEventBridge' });
    const bridge = createPreloadEventBridge({ api: { onMissing: vi.fn(() => undefined) }, bridgeName: 'TestBridge', logger, subscriptions: [{ id: 'missing', subscribe: (preloadApi) => preloadApi.onMissing(() => {}) }] });
    expect(bridge.size).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith('TestBridge: subscription "missing" did not return an unsubscribe function');
  });
});

describe('createManifestPreloadEventBridge', () => {
  it('derives preload subscriptions from manifest metadata and factoryMethod', () => {
    const unsubscribeA = vi.fn(), unsubscribeB = vi.fn();
    const api = { onMappedAvailable: vi.fn(() => unsubscribeA), onMappedError: vi.fn(() => unsubscribeB) };
    const handlers = { onMappedAvailable: vi.fn(), onMappedError: vi.fn() };
    const bridge = createManifestPreloadEventBridge({ api, descriptor: testDescriptor, bridgeName: 'TestBridge', handlers, manifest: testManifest });
    expect(api.onMappedAvailable).toHaveBeenCalledWith(handlers.onMappedAvailable);
    expect(api.onMappedError).toHaveBeenCalledWith(handlers.onMappedError);
    expect(bridge.size).toBe(2);
    bridge.dispose();
    expect(unsubscribeB).toHaveBeenCalledTimes(1);
    expect(unsubscribeA).toHaveBeenCalledTimes(1);
  });

  it('fails closed when a manifest subscription handler is missing', () => {
    const incompleteHandlers = { onMappedAvailable: vi.fn() } as Record<string, (...args: never[]) => void>;
    expect(() => createManifestPreloadEventBridge({ api: { onMappedAvailable: vi.fn(() => vi.fn()), onMappedError: vi.fn(() => vi.fn()) }, descriptor: testDescriptor, bridgeName: 'TestBridge', handlers: incompleteHandlers, manifest: testManifest })).toThrow('TestBridge: preload event handler missing for "testAPI.onMappedError"');
  });

  it('fails closed when a manifest subscription method is missing on the preload API', () => {
    expect(() => createManifestPreloadEventBridge({ api: { onMappedAvailable: vi.fn(() => vi.fn()) }, descriptor: testDescriptor, bridgeName: 'TestBridge', handlers: { onMappedAvailable: vi.fn(), onMappedError: vi.fn() }, manifest: testManifest })).toThrow('TestBridge: preload API method "testAPI.onMappedError" is not available');
  });

  it('fails closed when bridge descriptors drift from manifest subscriptions', () => { expect(() => createManifestPreloadEventBridge({ api: { onMappedAvailable: vi.fn(() => vi.fn()) }, descriptor: { apiName: 'testAPI', methods: ['onMappedAvailable'] } as const, bridgeName: 'TestBridge', handlers: { onMappedAvailable: vi.fn() }, manifest: testManifest })).toThrow('TestBridge: IPC manifest subscriptions missing from descriptor for "testAPI": onMappedError'); });
});
