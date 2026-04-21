import 'reflect-metadata';
import { METADATA_KEYS } from './metadata-keys';

/**
 * Electron process scope in which a service class is permitted to run.
 */
export type ServiceRunsScope = 'main' | 'renderer' | 'worker';

/**
 * Metadata attached to a class by the `@Service` decorator.
 */
export interface ServiceMetadata {
  /**
   * The process scope declared for this service.
   */
  runs: ServiceRunsScope;
}

export function setServiceMetadata(target: object, metadata: ServiceMetadata): void {
  Reflect.defineMetadata(METADATA_KEYS.SERVICE, metadata, target);
}

/**
 * Retrieves the `ServiceMetadata` attached to `target` by the `@Service` decorator.
 *
 * @param target - Class constructor to inspect.
 * @returns The stored metadata, or `undefined` when `@Service` was not applied.
 */
export function getServiceMetadata(target: object): ServiceMetadata | undefined {
  return Reflect.getMetadata(METADATA_KEYS.SERVICE, target) as ServiceMetadata | undefined;
}
