import 'reflect-metadata';
import type { ZodType } from 'zod';
import { METADATA_KEYS } from './metadata-keys';

/**
 * Descriptor for a single tRPC procedure registered by the `@Rpc` decorator.
 */
export interface RpcMethodMetadata {
  /**
   * Name of the decorated class method that implements the procedure.
   */
  methodName: string;

  /**
   * Optional Zod schema for validating the incoming payload.
   */
  schema: ZodType | undefined;

  /**
   * Override procedure name; falls back to `methodName` when `undefined`.
   */
  name: string | undefined;
}

export function addRpcMethod(target: object, metadata: RpcMethodMetadata): void {
  const existing = (Reflect.getMetadata(METADATA_KEYS.RPC_METHODS, target) as RpcMethodMetadata[] | undefined) ?? [];
  Reflect.defineMetadata(METADATA_KEYS.RPC_METHODS, [...existing, metadata], target);
}

/**
 * Returns all `RpcMethodMetadata` entries registered on `target` by `@Rpc` decorators.
 *
 * @param target - Class constructor to inspect.
 * @returns An array of RPC method descriptors, or an empty array when none are registered.
 */
export function getRpcMetadata(target: object): RpcMethodMetadata[] {
  return (Reflect.getMetadata(METADATA_KEYS.RPC_METHODS, target) as RpcMethodMetadata[] | undefined) ?? [];
}
