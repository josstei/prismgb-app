import 'reflect-metadata';
import { METADATA_KEYS } from './metadata-keys';

export interface SubscribeHandlerMetadata {
  channel: string;
  methodName: string;
}

export function addSubscribeHandler(target: object, metadata: SubscribeHandlerMetadata): void {
  const existing = (Reflect.getMetadata(METADATA_KEYS.SUBSCRIBE_HANDLERS, target) as SubscribeHandlerMetadata[] | undefined) ?? [];
  Reflect.defineMetadata(METADATA_KEYS.SUBSCRIBE_HANDLERS, [...existing, metadata], target);
}

export function getSubscribeHandlers(target: object): SubscribeHandlerMetadata[] {
  return (Reflect.getMetadata(METADATA_KEYS.SUBSCRIBE_HANDLERS, target) as SubscribeHandlerMetadata[] | undefined) ?? [];
}
