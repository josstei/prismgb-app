import { addOnDestroyMethod } from '../metadata/lifecycle-metadata';

export function OnDestroy(): MethodDecorator {
  return (target, propertyKey) => {
    addOnDestroyMethod(target.constructor, String(propertyKey));
  };
}
