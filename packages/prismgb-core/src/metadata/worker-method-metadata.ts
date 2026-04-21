import 'reflect-metadata';
import { METADATA_KEYS } from './metadata-keys';

/**
 * Descriptor for a single method registered by the `@WorkerMethod` decorator.
 */
export interface WorkerMethodMetadata {
  /**
   * Name of the decorated class method exposed across the Comlink boundary.
   */
  methodName: string;
}

export function addWorkerMethod(target: object, metadata: WorkerMethodMetadata): void {
  const existing = (Reflect.getMetadata(METADATA_KEYS.WORKER_METHODS, target) as WorkerMethodMetadata[] | undefined) ?? [];
  Reflect.defineMetadata(METADATA_KEYS.WORKER_METHODS, [...existing, metadata], target);
}

/**
 * Returns all `WorkerMethodMetadata` entries registered on `target` by `@WorkerMethod` decorators.
 *
 * @param target - Class constructor to inspect.
 * @returns An array of worker method descriptors, or an empty array when none are registered.
 */
export function getWorkerMethodMetadata(target: object): WorkerMethodMetadata[] {
  return (Reflect.getMetadata(METADATA_KEYS.WORKER_METHODS, target) as WorkerMethodMetadata[] | undefined) ?? [];
}
