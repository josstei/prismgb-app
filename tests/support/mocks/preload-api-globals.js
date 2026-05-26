import IpcManifest from '@shared/ipc/ipc.manifest.json';
import { createManifestSubscriptionSet } from '@preload/subscription.factory.js';
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
function getWindowObject() {
  if (!globalThis.window) {
    globalThis.window = {};
  }
  return globalThis.window;
}
export function setPreloadApi(name, value, { exposeOnGlobalThis = true } = {}) {
  getNamespace(name);
  const windowObject = getWindowObject();
  windowObject[name] = value;
  if (exposeOnGlobalThis) {
    globalThis[name] = value;
  }
  return value;
}
export function clearPreloadApi(name) {
  getNamespace(name);
  if (globalThis.window) {
    delete globalThis.window[name];
  }
  delete globalThis[name];
}
export function resetPreloadApis() {
  for (const name of PRELOAD_API_NAMES) {
    clearPreloadApi(name);
  }
}
