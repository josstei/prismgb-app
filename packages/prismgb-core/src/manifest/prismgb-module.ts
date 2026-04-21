import type { Constructable } from '../metadata/module-metadata';

export type ModuleSurface = 'shared' | 'main' | 'renderer' | 'worker';

export interface ModuleLoader {
  (): Promise<{ default: Constructable }>;
}

export interface ManifestContractPointer {
  contract: string;
}

export interface PrismgbModule {
  name: string;
  version: string;
  surfaces: ModuleSurface[];
  main?: ModuleLoader;
  renderer?: ModuleLoader;
  worker?: ModuleLoader;
  events?: ManifestContractPointer;
  rpc?: ManifestContractPointer;
}
