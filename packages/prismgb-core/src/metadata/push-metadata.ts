import 'reflect-metadata';
import { METADATA_KEYS } from './metadata-keys';

export function addPushProperty(target: object, propertyName: string): void {
  const existing = (Reflect.getMetadata(METADATA_KEYS.PUSH_PROPERTIES, target) as string[] | undefined) ?? [];
  Reflect.defineMetadata(METADATA_KEYS.PUSH_PROPERTIES, [...existing, propertyName], target);
}

/**
 * Returns the names of all properties registered on `target` by `@Push` decorators.
 *
 * @param target - Class constructor to inspect.
 * @returns An array of property names, or an empty array when none are registered.
 */
export function getPushProperties(target: object): string[] {
  return (Reflect.getMetadata(METADATA_KEYS.PUSH_PROPERTIES, target) as string[] | undefined) ?? [];
}
