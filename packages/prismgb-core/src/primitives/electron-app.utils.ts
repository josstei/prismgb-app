/// <reference types="node" />
import nodeModule from 'node:module';

/**
 * Structural view of the Electron `app` API surface shared code relies on,
 * kept dependency-free so core needs no electron type import.
 */
export interface ElectronAppLike {
  isPackaged: boolean;
  isQuitting?: boolean;
  getPath(name: string): string;
}

let cachedElectronApp: ElectronAppLike | null | undefined;

/**
 * Resolves the Electron `app` instance when running in the main process,
 * or null outside Electron (plain Node, renderer, tests). Memoized.
 */
export function getElectronApp(): ElectronAppLike | null {
  if (cachedElectronApp === undefined) {
    try {
      const createRequire = nodeModule.createRequire;
      const require = createRequire(import.meta.url);
      cachedElectronApp = (require('electron') as { app?: ElectronAppLike }).app ?? null;
    } catch {
      cachedElectronApp = null;
    }
  }
  return cachedElectronApp;
}
