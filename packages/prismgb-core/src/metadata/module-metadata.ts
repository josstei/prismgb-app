import 'reflect-metadata';
import { METADATA_KEYS } from './metadata-keys';

export type Constructable = new (...args: unknown[]) => object;

export interface ModuleMetadata {
  providers: Constructable[];
  imports: Constructable[];
}

export function setModuleMetadata(target: object, metadata: ModuleMetadata): void {
  Reflect.defineMetadata(METADATA_KEYS.MODULE, metadata, target);
}

export function getModuleMetadata(target: object): ModuleMetadata | undefined {
  return Reflect.getMetadata(METADATA_KEYS.MODULE, target) as ModuleMetadata | undefined;
}
