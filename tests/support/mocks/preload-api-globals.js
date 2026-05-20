const PRELOAD_API_NAMES = [
  'deviceAPI',
  'windowAPI',
  'updateAPI',
  'transcodeAPI',
  'metricsAPI',
  'loginItemAPI'
];

function getWindowObject() {
  if (!globalThis.window) {
    globalThis.window = {};
  }
  return globalThis.window;
}

export function setPreloadApi(name, value, { exposeOnGlobalThis = true } = {}) {
  const windowObject = getWindowObject();
  windowObject[name] = value;
  if (exposeOnGlobalThis) {
    globalThis[name] = value;
  }
  return value;
}

export function clearPreloadApi(name) {
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
