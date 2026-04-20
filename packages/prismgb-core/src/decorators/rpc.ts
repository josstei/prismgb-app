import type { ZodType } from 'zod';
import { addRpcMethod } from '../metadata/rpc-metadata';

export interface RpcOptions {
  schema?: ZodType;
  name?: string;
}

export function Rpc(options: RpcOptions = {}): MethodDecorator {
  return (target, propertyKey) => {
    addRpcMethod(target.constructor, {
      methodName: String(propertyKey),
      schema: options.schema,
      name: options.name
    });
  };
}
