import 'reflect-metadata';
import { METADATA_KEYS } from './metadata-keys';

export type ServiceRunsScope = 'main' | 'renderer' | 'worker';

export interface ServiceMetadata {
  runs: ServiceRunsScope;
}

export function setServiceMetadata(target: object, metadata: ServiceMetadata): void {
  Reflect.defineMetadata(METADATA_KEYS.SERVICE, metadata, target);
}

export function getServiceMetadata(target: object): ServiceMetadata | undefined {
  return Reflect.getMetadata(METADATA_KEYS.SERVICE, target) as ServiceMetadata | undefined;
}
