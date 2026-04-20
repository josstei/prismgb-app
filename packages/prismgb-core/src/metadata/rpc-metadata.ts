import 'reflect-metadata';
import type { ZodType } from 'zod';
import { METADATA_KEYS } from './metadata-keys';

export interface RpcMethodMetadata {
  methodName: string;
  schema: ZodType | undefined;
  name: string | undefined;
}

export function addRpcMethod(target: object, metadata: RpcMethodMetadata): void {
  const existing = (Reflect.getMetadata(METADATA_KEYS.RPC_METHODS, target) as RpcMethodMetadata[] | undefined) ?? [];
  Reflect.defineMetadata(METADATA_KEYS.RPC_METHODS, [...existing, metadata], target);
}

export function getRpcMetadata(target: object): RpcMethodMetadata[] {
  return (Reflect.getMetadata(METADATA_KEYS.RPC_METHODS, target) as RpcMethodMetadata[] | undefined) ?? [];
}
