import type { Constructable } from '../metadata/module-metadata';

/**
 * Electron process surface a capability module targets.
 */
export type ModuleSurface = 'shared' | 'main' | 'renderer' | 'worker';

/**
 * Async factory that lazily loads a module class for dynamic import splitting.
 *
 * Each surface entry point (main, renderer, worker) on `PrismgbModule` uses
 * this signature so the runtime can tree-shake unused surfaces.
 */
export interface ModuleLoader {
  (): Promise<{ default: Constructable }>;
}

/**
 * Reference to an external contract file that describes the event or RPC surface.
 */
export interface ManifestContractPointer {
  /**
   * Module-specifier path to the contract file relative to the module package root.
   */
  contract: string;
}

/**
 * Manifest descriptor for a PrismGB capability module.
 *
 * Capability packages export a `PrismgbModule` constant that the platform
 * host reads to load the correct surface entry points and wire up event and
 * RPC contracts before the DI container is assembled.
 */
export interface PrismgbModule {
  /**
   * Unique human-readable identifier for the module (e.g. `'@prismgb/devices'`).
   */
  name: string;

  /**
   * SemVer version string of the module package.
   */
  version: string;

  /**
   * Process surfaces this module provides code for.
   */
  surfaces: ModuleSurface[];

  /**
   * Async loader for the main-process entry point.
   *
   * Omit when the module has no main-process code.
   */
  main?: ModuleLoader;

  /**
   * Async loader for the renderer-process entry point.
   *
   * Omit when the module has no renderer-process code.
   */
  renderer?: ModuleLoader;

  /**
   * Async loader for the worker-thread entry point.
   *
   * Omit when the module has no worker-thread code.
   */
  worker?: ModuleLoader;

  /**
   * Pointer to the event contract file that declares this module's event channels.
   *
   * Omit when the module publishes no events.
   */
  events?: ManifestContractPointer;

  /**
   * Pointer to the RPC contract file that declares this module's tRPC procedures.
   *
   * Omit when the module exposes no RPC procedures.
   */
  rpc?: ManifestContractPointer;
}
