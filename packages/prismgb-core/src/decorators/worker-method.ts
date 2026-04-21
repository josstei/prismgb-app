import { addWorkerMethod } from '../metadata/worker-method-metadata';

/**
 * Marks a method as callable across the Comlink worker boundary.
 *
 * The method name is recorded in `worker-method-metadata`. The runtime uses
 * this to generate the Comlink proxy interface exposed to the host process,
 * ensuring only explicitly annotated methods are callable remotely.
 *
 * @returns A method decorator that registers the target as a worker-exposed method.
 *
 * @example
 * ```ts
 * @Injectable()
 * @Service({ runs: 'worker' })
 * class ShaderCompilerService {
 *   @WorkerMethod()
 *   compile(source: string): CompiledShader {
 *     return this.compiler.run(source);
 *   }
 * }
 * ```
 */
export function WorkerMethod(): MethodDecorator {
  return (target, propertyKey) => {
    addWorkerMethod(target.constructor, { methodName: String(propertyKey) });
  };
}
