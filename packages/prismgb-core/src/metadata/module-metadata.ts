import 'reflect-metadata';
import { METADATA_KEYS } from './metadata-keys';

/**
 * Any class constructor whose instances are plain objects.
 *
 * Used as a generic constraint wherever a DI-registerable class reference is required.
 */
export type Constructable = new (...args: unknown[]) => object;

/**
 * Metadata attached to a class by the `@Module` decorator.
 */
export interface ModuleMetadata {
  /**
   * Classes registered as DI providers within the module.
   */
  providers: Constructable[];

  /**
   * Other module classes whose providers are made available to this module.
   */
  imports: Constructable[];
}

export function setModuleMetadata(target: object, metadata: ModuleMetadata): void {
  Reflect.defineMetadata(METADATA_KEYS.MODULE, metadata, target);
}

/**
 * Retrieves the `ModuleMetadata` attached to `target` by the `@Module` decorator.
 *
 * @param target - Class constructor to inspect.
 * @returns The stored metadata, or `undefined` when `@Module` was not applied.
 */
export function getModuleMetadata(target: object): ModuleMetadata | undefined {
  return Reflect.getMetadata(METADATA_KEYS.MODULE, target) as ModuleMetadata | undefined;
}
