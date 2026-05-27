import { describe, expect, it, vi, afterEach } from 'vitest';
import { IPC_CHANNELS as channels } from '@shared/ipc/ipc.manifest.js';
import { DisposableBag } from '@shared/base/disposable-bag.js';
import { TypedRegistryFactory } from '@shared/registry/typed-registry.factory.js';
import { createUpdatePreloadAPI } from '@preload/apis/update.preload-api.js';
import { createListenerRegistry, MAX_LISTENERS_PER_CHANNEL } from '@preload/listener-registry.js';
import { createMockIpcRenderer } from '../../support/mocks/preload-api-globals.js';

function createUpdateApi(ipcRenderer, registry = createListenerRegistry()) {
  return createUpdatePreloadAPI({
    ipcRenderer,
    channels,
    listenerRegistry: registry,
    maxListeners: MAX_LISTENERS_PER_CHANNEL,
    isValidCallback: (value) => typeof value === 'function',
    isValidUpdateInfo: (value) => value && typeof value === 'object',
    isValidProgress: (value) => value && typeof value === 'object',
    isValidError: (value) => value && typeof value === 'object'
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Phase 1 foundational lifecycle utilities', () => {
  it('clears sync and async disposables once in reverse registration order', async () => {
    const bag = new DisposableBag();
    const calls = [];

    bag.add(() => {
      calls.push('first');
    });
    bag.add(async () => {
      calls.push('second');
    });

    await bag.clear();
    await bag.clear();

    expect(calls).toEqual(['second', 'first']);
    expect(bag.size).toBe(0);
  });

  it('tracks event listener cleanup without leaking removed entries', async () => {
    const bag = new DisposableBag();
    const target = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    const listener = vi.fn();

    const unsubscribe = bag.addEvent(target, 'change', listener);
    unsubscribe();
    await bag.clear();

    expect(target.addEventListener).toHaveBeenCalledWith('change', listener, undefined);
    expect(target.removeEventListener).toHaveBeenCalledTimes(1);
    expect(target.removeEventListener).toHaveBeenCalledWith('change', listener, undefined);
  });
});

describe('Phase 1 preload subscription factory adoption', () => {
  it('routes updateAPI.onError through the subscription factory without changing payload behavior', () => {
    const ipcRenderer = createMockIpcRenderer();
    const updateAPI = createUpdateApi(ipcRenderer);
    const callback = vi.fn();

    const unsubscribe = updateAPI.onError(callback);
    const listener = ipcRenderer.on.mock.calls[0][1];
    const payload = { message: 'Download failed' };

    listener({}, payload);
    unsubscribe();

    expect(ipcRenderer.on).toHaveBeenCalledWith(channels.UPDATE.ERROR, listener);
    expect(callback).toHaveBeenCalledWith(payload);
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(channels.UPDATE.ERROR, listener);
  });

  it('keeps current updateAPI.onError callback and payload warnings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ipcRenderer = createMockIpcRenderer();
    const updateAPI = createUpdateApi(ipcRenderer);

    updateAPI.onError('not-a-callback');
    expect(warn).toHaveBeenCalledWith('updateAPI.onError: Invalid callback provided');

    const callback = vi.fn();
    updateAPI.onError(callback);
    const listener = ipcRenderer.on.mock.calls[0][1];
    listener({}, null);

    expect(warn).toHaveBeenCalledWith('updateAPI.onError: Invalid error received');
    expect(callback).not.toHaveBeenCalled();
  });
});

describe('Phase 1 typed registry foundation', () => {
  it('centralizes register/create/metadata/unregister lifecycle', () => {
    const registry = new TypedRegistryFactory();

    registry.register('alpha', (value) => ({ value }), { enabled: true });

    expect(registry.has('alpha')).toBe(true);
    expect(registry.listIds()).toEqual(['alpha']);
    expect(registry.getMetadata('alpha')).toEqual({ enabled: true });
    expect(registry.create('alpha', 42)).toEqual({ value: 42 });
    expect(registry.unregister('alpha')).toBe(true);
    expect(registry.has('alpha')).toBe(false);
  });

  it('creates constant values without exposing mutable registry internals', () => {
    const registry = new TypedRegistryFactory();
    const value = { type: 'constant' };

    registry.registerValue('constant', value, { enabled: true });

    expect(registry.create('constant')).toBe(value);
    expect(registry.getMetadata('constant')).toEqual({ enabled: true });
    expect(registry).not.toHaveProperty('getValueMap');
    expect(registry).not.toHaveProperty('getMetadataMap');

    registry.unregister('constant');
    expect(registry.has('constant')).toBe(false);
    expect(registry.getMetadata('constant')).toBeUndefined();
  });
});
