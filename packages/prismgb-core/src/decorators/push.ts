import { addPushProperty } from '../metadata/push-metadata';

export function Push<_T>(): PropertyDecorator {
  return (target, propertyKey) => {
    addPushProperty(target.constructor, String(propertyKey));
  };
}
