import { addOnDestroyMethod } from '../metadata/lifecycle-metadata';

/**
 * Marks a method to be called by the runtime during service teardown.
 *
 * The method name is recorded in `lifecycle-metadata` and invoked when the
 * container disposes the owning service. Use to release resources such as
 * event subscriptions, file handles, or IPC listeners.
 *
 * @returns A method decorator that registers the target method as a destroy hook.
 *
 * @example
 * ```ts
 * @Injectable()
 * @Service({ runs: 'main' })
 * class UsbWatcherService {
 *   @OnDestroy()
 *   stop(): void {
 *     this.watcher.close();
 *   }
 * }
 * ```
 */
export function OnDestroy(): MethodDecorator {
  return (target, propertyKey) => {
    addOnDestroyMethod(target.constructor, String(propertyKey));
  };
}
