import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import channelsJson from '@shared/ipc/channels.json';

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

function extractIpcChannelReferences(source) {
  const refs = [];
  const channelRefPattern = /IPC_CHANNELS\.([A-Z_]+)\.([A-Z_]+)/g;
  for (const match of source.matchAll(channelRefPattern)) {
    refs.push({
      namespace: match[1],
      key: match[2]
    });
  }
  return refs;
}

function readPreloadTypeSource() {
  const typePath = path.resolve(process.cwd(), 'src/types/preload-api.d.ts');
  return fs.readFileSync(typePath, 'utf8');
}

describe('Preload API contract', () => {
  it('matches the expected preload exposure shape', () => {
    const source = readPreloadSource();
    const apiMap = extractExposedApis(source);

    const expected = {
      deviceAPI: ['getDeviceStatus', 'onDeviceConnected', 'onDeviceDisconnected'],
      shellAPI: ['openExternal'],
      windowAPI: ['onEnterFullscreen', 'onLeaveFullscreen', 'onResized', 'setFullScreen', 'isFullScreen'],
      updateAPI: ['getStatus', 'checkForUpdates', 'downloadUpdate', 'installUpdate', 'onAvailable', 'onNotAvailable', 'onProgress', 'onDownloaded', 'onError'],
      metricsAPI: ['getProcessMetrics'],
      gpuAPI: ['getPolicy'],
      loginItemAPI: ['get', 'set'],
      transcodeAPI: ['start', 'cancel', 'getStatus', 'onProgress', 'onCompleted', 'onError', 'onCancelled']
    };

    expect(Array.from(apiMap.keys()).sort()).toEqual(Object.keys(expected).sort());

    for (const [apiName, methods] of Object.entries(expected)) {
      expect(apiMap.get(apiName)).toEqual(methods);
    }
  });

  it('references only channels defined in channels.json', () => {
    const source = readPreloadSource();
    const refs = extractIpcChannelReferences(source);

    for (const { namespace, key } of refs) {
      expect(channelsJson[namespace]).toBeDefined();
      expect(channelsJson[namespace][key]).toBeDefined();
    }
  });

  it('keeps preload declaration contract typed (no Promise<unknown>)', () => {
    const typeSource = readPreloadTypeSource();

    expect(typeSource).toContain("from '@shared/ipc/preload-api.contract.js'");
    expect(typeSource).not.toContain('Promise<unknown>');
    expect(typeSource).not.toMatch(/callback:\s*\([^)]*unknown/);
  });
});
