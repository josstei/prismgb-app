import { IpcContractManifest as IpcManifest } from '@prismgb/ipc';
import { createManifestSubscriptionSet } from '@preload/subscription.factory.js';
import { installTargetProperty } from './runtime-property.installers.js';
const normalizeTrimmedString = (value) => typeof value === 'string' ? value.trim() : '';
const derivePublicMethodName = ({ factoryMethod, method }) => normalizeTrimmedString(factoryMethod || method);
const createNamespaceByApiName = (manifest) =>
  Object.fromEntries((manifest?.namespaces || []).map((namespace) => [namespace.apiName, namespace]));
const PRELOAD_NAMESPACE_BY_API_NAME = Object.freeze(
  createNamespaceByApiName(IpcManifest)
);
export const PRELOAD_API_NAMES = Object.freeze(Object.keys(PRELOAD_NAMESPACE_BY_API_NAME));
const expectedApiNames = () => PRELOAD_API_NAMES.join(', ');
function getNamespace(apiName, namespaceByApiName = PRELOAD_NAMESPACE_BY_API_NAME) {
  const namespace = namespaceByApiName[apiName];
  if (!namespace) {
    throw new Error(`Unknown preload API "${apiName}". Expected one of: ${Object.keys(namespaceByApiName).join(', ') || expectedApiNames()}`);
  }
  return namespace;
}
function getVitestFn() {
  if (!globalThis.vi?.fn) {
    throw new Error('Vitest global "vi" is required to create preload API mocks');
  }
  return globalThis.vi.fn;
}
function createSubscriptionMock(fn, { dispatchPayload }) {
  const listeners = [];
  const unsubscribers = [];
  const subscription = fn((callback) => {
    const listener = { active: typeof callback === 'function', callback };
    const unsubscribe = fn(() => { listener.active = false; });
    if (listener.active) {
      listeners.push(listener);
      unsubscribers.push(unsubscribe);
    }
    return unsubscribe;
  });
  Object.defineProperties(subscription, {
    emit: { value: (payload) => [...listeners].forEach((listener) => { if (listener.active) dispatchPayload ? listener.callback(payload) : listener.callback(); }) },
    listenerCount: { value: () => listeners.filter((listener) => listener.active).length },
    getUnsubscribers: { value: () => [...unsubscribers] },
    resetListeners: { value: () => { listeners.length = 0; unsubscribers.length = 0; } }
  });
  return subscription;
}
export function createPreloadApiMock(apiName, overrides = {}, manifest = IpcManifest) {
  const namespaceByApiName = manifest === IpcManifest ? PRELOAD_NAMESPACE_BY_API_NAME : createNamespaceByApiName(manifest);
  const namespace = getNamespace(apiName, namespaceByApiName);
  const fn = getVitestFn();
  const mocks = {
    ...Object.fromEntries((namespace.invoke ?? []).map((entry) => [derivePublicMethodName(entry), fn()])),
    ...Object.fromEntries(createManifestSubscriptionSet(apiName, manifest).subscriptions.map(({ methodName, payload }) => [methodName, createSubscriptionMock(fn, { dispatchPayload: payload !== 'void' })]))
  };
  for (const methodName of Object.keys(overrides)) if (!Object.prototype.hasOwnProperty.call(mocks, methodName)) throw new Error(`Unknown preload API method "${apiName}.${methodName}"`);
  return { ...mocks, ...overrides };
}
export function createPreloadApiMocks(overridesByApi = {}, manifest = IpcManifest) {
  const namespaceByApiName = manifest === IpcManifest ? PRELOAD_NAMESPACE_BY_API_NAME : createNamespaceByApiName(manifest);
  for (const apiName of Object.keys(overridesByApi)) getNamespace(apiName, namespaceByApiName);
  const apiNames = manifest === IpcManifest ? PRELOAD_API_NAMES : Object.keys(namespaceByApiName);
  return Object.fromEntries(apiNames.map((apiName) => [apiName, createPreloadApiMock(apiName, overridesByApi[apiName], manifest)]));
}
export function createMockIpcRenderer(overrides = {}) {
  const fn = getVitestFn(), listeners = new Map();
  return {
    invoke: fn(async (channel, ...args) => {
      if (!Object.prototype.hasOwnProperty.call(overrides, channel)) return { success: true };
      const value = overrides[channel];
      return typeof value === 'function' ? value(channel, args.length === 0 ? undefined : args[0], ...args.slice(1)) : value;
    }),
    on: fn((channel, callback) => {
      const handlers = listeners.get(channel) || [];
      handlers.push(callback); listeners.set(channel, handlers);
    }),
    removeListener: fn((channel, callback) => {
      const handlers = listeners.get(channel);
      if (handlers) listeners.set(channel, handlers.filter((handler) => handler !== callback));
    }),
    emit: (channel, ...args) => (listeners.get(channel) || []).forEach((handler) => handler({}, ...args)),
    removeAllListeners: fn()
  };
}
const activePreloadApiHandles = new Map();
let syntheticWindowHandle = null;
function getWindowObject() {
  if (!globalThis.window) {
    syntheticWindowHandle = installTargetProperty(globalThis, 'window', {});
  }
  return globalThis.window;
}
function cleanupSyntheticWindowIfUnused() {
  if (syntheticWindowHandle && activePreloadApiHandles.size === 0) {
    syntheticWindowHandle.cleanup();
    syntheticWindowHandle = null;
  }
}
export function setPreloadApi(name, value, { exposeOnGlobalThis = true } = {}) {
  getNamespace(name);
  clearPreloadApi(name);
  const handles = {
    window: null,
    globalThis: null
  };
  try {
    const windowObject = getWindowObject();
    handles.window = installTargetProperty(windowObject, name, value);
    if (exposeOnGlobalThis) {
      handles.globalThis = installTargetProperty(globalThis, name, value);
    }
    activePreloadApiHandles.set(name, handles);
    return value;
  } catch (error) {
    handles.globalThis?.cleanup();
    handles.window?.cleanup();
    cleanupSyntheticWindowIfUnused();
    throw error;
  }
}
export function clearPreloadApi(name) {
  getNamespace(name);
  const handles = activePreloadApiHandles.get(name);
  if (handles) {
    handles.globalThis?.cleanup();
    handles.window?.cleanup();
    activePreloadApiHandles.delete(name);
  }
  cleanupSyntheticWindowIfUnused();
}
export function resetPreloadApis() {
  for (const name of PRELOAD_API_NAMES) {
    clearPreloadApi(name);
  }
}
