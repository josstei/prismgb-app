import 'reflect-metadata';
import { METADATA_KEYS } from './metadata-keys';

export function addOnInitMethod(target: object, methodName: string): void {
  const existing = (Reflect.getMetadata(METADATA_KEYS.ON_INIT, target) as string[] | undefined) ?? [];
  Reflect.defineMetadata(METADATA_KEYS.ON_INIT, [...existing, methodName], target);
}

/**
 * Returns the names of all methods registered on `target` by `@OnInit` decorators.
 *
 * @param target - Class constructor to inspect.
 * @returns An array of method names to invoke after construction, or an empty array.
 */
export function getOnInitMethods(target: object): string[] {
  return (Reflect.getMetadata(METADATA_KEYS.ON_INIT, target) as string[] | undefined) ?? [];
}

export function addOnDestroyMethod(target: object, methodName: string): void {
  const existing = (Reflect.getMetadata(METADATA_KEYS.ON_DESTROY, target) as string[] | undefined) ?? [];
  Reflect.defineMetadata(METADATA_KEYS.ON_DESTROY, [...existing, methodName], target);
}

/**
 * Returns the names of all methods registered on `target` by `@OnDestroy` decorators.
 *
 * @param target - Class constructor to inspect.
 * @returns An array of method names to invoke during teardown, or an empty array.
 */
export function getOnDestroyMethods(target: object): string[] {
  return (Reflect.getMetadata(METADATA_KEYS.ON_DESTROY, target) as string[] | undefined) ?? [];
}
