import { addOnInitMethod } from '../metadata/lifecycle-metadata';

/**
 * Marks a method to be called by the runtime after the service is fully constructed.
 *
 * The method name is recorded in `lifecycle-metadata` and invoked during the
 * container's initialization phase. Only one `@OnInit` method per class is
 * recommended, though multiple are supported.
 *
 * @returns A method decorator that registers the target method as an init hook.
 *
 * @example
 * ```ts
 * @Injectable()
 * @Service({ runs: 'main' })
 * class UsbWatcherService {
 *   @OnInit()
 *   start(): void {
 *     this.watcher.open();
 *   }
 * }
 * ```
 */
export function OnInit(): MethodDecorator {
  return (target, propertyKey) => {
    addOnInitMethod(target.constructor, String(propertyKey));
  };
}
