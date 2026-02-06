import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

function readPreloadSource() {
  const preloadPath = path.resolve(process.cwd(), 'src/preload/index.js');
  return fs.readFileSync(preloadPath, 'utf8');
}

function extractExposedApis(source) {
  const exposeRegex = /contextBridge\.exposeInMainWorld\('([^']+)',\s*\{([\s\S]*?)\}\);/g;
  const apiMap = new Map();

  for (const match of source.matchAll(exposeRegex)) {
    const apiName = match[1];
    const body = match[2];
    const methods = [];

    for (const methodMatch of body.matchAll(/^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:/gm)) {
      methods.push(methodMatch[1]);
    }

    apiMap.set(apiName, methods);
  }

  return apiMap;
}

describe('Preload API contract', () => {
  it('matches the expected preload exposure shape', () => {
    const source = readPreloadSource();
    const apiMap = extractExposedApis(source);

    const expected = {
      deviceAPI: ['getDeviceStatus', 'onDeviceConnected', 'onDeviceDisconnected', 'removeDeviceListeners'],
      shellAPI: ['openExternal'],
      windowAPI: ['onEnterFullscreen', 'onLeaveFullscreen', 'onResized', 'setFullScreen', 'isFullScreen', 'removeListeners'],
      updateAPI: ['getStatus', 'checkForUpdates', 'downloadUpdate', 'installUpdate', 'onAvailable', 'onNotAvailable', 'onProgress', 'onDownloaded', 'onError', 'removeListeners'],
      metricsAPI: ['getProcessMetrics'],
      gpuAPI: ['getPolicy'],
      transcodeAPI: ['start', 'cancel', 'getStatus', 'onProgress', 'onCompleted', 'onError', 'onCancelled', 'removeListeners']
    };

    expect(Array.from(apiMap.keys()).sort()).toEqual(Object.keys(expected).sort());

    for (const [apiName, methods] of Object.entries(expected)) {
      expect(apiMap.get(apiName)).toEqual(methods);
    }
  });
});
