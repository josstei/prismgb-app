import { addSubscribeHandler } from '../metadata/subscribe-metadata';

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
