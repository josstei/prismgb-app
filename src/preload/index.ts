import type { IpcRenderer } from 'electron';

/**
 * Preload bridge for electron-trpc (the renderer↔main tRPC transport).
 *
 * This inlines electron-trpc's own `exposeElectronTRPC` (dist/main.mjs) rather than importing it:
 * the preload is bundled as a CommonJS-scoped IIFE, into which `electron-trpc/main` cannot bundle
 * (it emits a raw top-level `import` of `electron`). The exposed `electronTRPC` global is read by the
 * renderer's `ipcLink`; its `{ sendMessage, onMessage }` shape is electron-trpc's contract.
 */

type PreloadElectron = {
  contextBridge: typeof import('electron')['contextBridge'];
  ipcRenderer: IpcRenderer;
};

const ELECTRON_TRPC_CHANNEL = 'electron-trpc';

const { contextBridge, ipcRenderer } = require('electron') as PreloadElectron;

contextBridge.exposeInMainWorld('electronTRPC', {
  sendMessage: (operation: unknown) => ipcRenderer.send(ELECTRON_TRPC_CHANNEL, operation),
  onMessage: (callback: (response: unknown) => void) =>
    ipcRenderer.on(ELECTRON_TRPC_CHANNEL, (_event, response: unknown) => callback(response))
});
