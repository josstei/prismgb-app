import type { ZodType } from 'zod';
import { addRpcMethod } from '../metadata/rpc-metadata';

/**
 * Configuration options for the `@Rpc` decorator.
 */
export interface RpcOptions {
  /**
   * Zod schema used to validate the incoming payload before the method is invoked.
   *
   * When omitted, no runtime validation is applied.
   */
  schema?: ZodType;
  /**
   * Override name for the tRPC procedure.
   *
   * Defaults to the decorated method's own name when not provided.
   */
  name?: string;
}

/**
 * Exposes a method as a tRPC procedure callable from another Electron process.
 *
 * The method name and optional schema are recorded in `rpc-metadata`. The
 * runtime reads this metadata to build the tRPC router for the owning service.
 *
 * @param options - Optional RPC configuration including validation schema and procedure name.
 * @returns A method decorator that registers the target as an RPC endpoint.
 *
 * @example
 * ```ts
 * @Injectable()
 * @Service({ runs: 'main' })
 * class CaptureService {
 *   @Rpc({ schema: z.object({ format: z.string() }) })
 *   async captureFrame(options: { format: string }): Promise<void> {
 *     await this.screenshot(options.format);
 *   }
 * }
 * ```
 */
export function Rpc(options: RpcOptions = {}): MethodDecorator {
  return (target, propertyKey) => {
    addRpcMethod(target.constructor, {
      methodName: String(propertyKey),
      schema: options.schema,
      name: options.name
    });
  };
}
