import { setModuleMetadata, type Constructable } from '../metadata/module-metadata';

/**
 * Configuration options for the `@Module` decorator.
 */
export interface ModuleOptions {
  /**
   * Classes registered as DI providers within this module.
   */
  providers: Constructable[];
  /**
   * Other module classes whose providers are made available to this module.
   */
  imports?: Constructable[];
}

/**
 * Declares a class as a PrismGB capability module that groups DI providers.
 *
 * Attaches `ModuleMetadata` to the class constructor, recording the providers
 * and imported modules. The runtime reads this metadata to compose the DI
 * container for the declared process surfaces.
 *
 * @param options - Module configuration including providers and optional imports.
 * @returns A class decorator that stores module metadata on the target.
 * @throws {Error} When `options.providers` is not an array.
 * @throws {Error} When `options.imports` is provided but is not an array.
 *
 * @example
 * ```ts
 * @Module({
 *   providers: [DeviceService, DeviceBridgeService],
 *   imports: [LoggingModule],
 * })
 * class DeviceModule {}
 * ```
 */
export function Module(options: ModuleOptions): ClassDecorator {
  if (!Array.isArray(options.providers)) {
    throw new Error('@Module: providers must be an array.');
  }
  if (options.imports !== undefined && !Array.isArray(options.imports)) {
    throw new Error('@Module: imports must be an array when provided.');
  }
  return (target) => {
    setModuleMetadata(target, {
      providers: [...options.providers],
      imports: options.imports ? [...options.imports] : []
    });
  };
}
