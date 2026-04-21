import 'reflect-metadata';
import { METADATA_KEYS } from './metadata-keys';

/**
 * Descriptor for a single event-bus subscription registered by the `@Subscribe` decorator.
 */
export interface SubscribeHandlerMetadata {
  /**
   * Event-bus channel name this handler subscribes to.
   */
  channel: string;

  /**
   * Name of the decorated class method that receives each published payload.
   */
  methodName: string;
}

export function addSubscribeHandler(target: object, metadata: SubscribeHandlerMetadata): void {
  const existing = (Reflect.getMetadata(METADATA_KEYS.SUBSCRIBE_HANDLERS, target) as SubscribeHandlerMetadata[] | undefined) ?? [];
  Reflect.defineMetadata(METADATA_KEYS.SUBSCRIBE_HANDLERS, [...existing, metadata], target);
}

/**
 * Returns all `SubscribeHandlerMetadata` entries registered on `target` by `@Subscribe` decorators.
 *
 * @param target - Class constructor to inspect.
 * @returns An array of subscription descriptors, or an empty array when none are registered.
 */
export function getSubscribeHandlers(target: object): SubscribeHandlerMetadata[] {
  return (Reflect.getMetadata(METADATA_KEYS.SUBSCRIBE_HANDLERS, target) as SubscribeHandlerMetadata[] | undefined) ?? [];
}
