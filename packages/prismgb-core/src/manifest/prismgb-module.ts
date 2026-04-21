export type ModuleSurface = 'shared' | 'main' | 'renderer' | 'worker';

export type ModuleClass = new (...args: unknown[]) => object;

export interface ModuleLoader {
  (): Promise<{ default: ModuleClass }>;
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
