import { addSubscribeHandler } from '../metadata/subscribe-metadata';

/**
 * Registers a method as a typed event-bus subscriber for the given channel.
 *
 * The runtime reads `subscribe-metadata` at initialization and wires the
 * decorated method to the `EventBus` so it receives every payload published
 * on `channel`. The subscription is torn down automatically when the owning
 * service is destroyed.
 *
 * @param channel - Event-bus channel name to subscribe to (non-empty string).
 * @returns A method decorator that registers the target as an event handler.
 * @throws {Error} When `channel` is not a non-empty string.
 *
 * @example
 * ```ts
 * @Injectable()
 * @Service({ runs: 'renderer' })
 * class StreamingService {
 *   @Subscribe('device:connected')
 *   onDeviceConnected(device: DeviceInfo): void {
 *     this.startStream(device);
 *   }
 * }
 * ```
 */
export function Subscribe(channel: string): MethodDecorator {
  if (typeof channel !== 'string' || channel.length === 0) {
    throw new Error('@Subscribe: channel must be a non-empty string.');
  }
  return (target, propertyKey) => {
    addSubscribeHandler(target.constructor, {
      channel,
      methodName: String(propertyKey)
    });
  };
}
