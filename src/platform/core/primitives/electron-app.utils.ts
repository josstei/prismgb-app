/// <reference types="node" />

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
 *
 * Node access happens lazily inside the call via `process.getBuiltinModule`
 * so this module stays evaluation-safe in the renderer, where the barrel
 * that re-exports it is served unbundled in dev mode and a module-scope
 * node import would throw at load time, before first use.
 */
export function getElectronApp(): ElectronAppLike | null {
  if (cachedElectronApp === undefined) {
    cachedElectronApp = resolveElectronApp();
  }
  return cachedElectronApp;
}

function resolveElectronApp(): ElectronAppLike | null {
  try {
    const nodeProcess = (globalThis as { process?: NodeJS.Process }).process;
    const nodeModule = nodeProcess?.getBuiltinModule?.('node:module');
    if (!nodeModule) {
      return null;
    }
    const require = nodeModule.createRequire(import.meta.url);
    return (require('electron') as { app?: ElectronAppLike }).app ?? null;
  } catch {
    return null;
  }
}
