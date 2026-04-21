import { addPushProperty } from '../metadata/push-metadata';

/**
 * Declares a class property as a push channel exposed to cross-process consumers.
 *
 * The property name is recorded in `push-metadata`. The runtime uses this to
 * build the observable surface that peer processes can subscribe to without
 * holding a direct reference to the owning service.
 *
 * @typeParam T - Payload type the property will emit.
 * @returns A property decorator that registers the target property as a push channel.
 *
 * @example
 * ```ts
 * @Injectable()
 * @Service({ runs: 'main' })
 * class DeviceService {
 *   @Push<DeviceInfo>()
 *   readonly connected = new Channel<DeviceInfo>();
 * }
 * ```
 */
export function Push<_T>(): PropertyDecorator {
  return (target, propertyKey) => {
    addPushProperty(target.constructor, String(propertyKey));
  };
}
