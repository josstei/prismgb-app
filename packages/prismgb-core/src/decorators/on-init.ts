import { addOnInitMethod } from '../metadata/lifecycle-metadata';

export function OnInit(): MethodDecorator {
  return (target, propertyKey) => {
    addOnInitMethod(target.constructor, String(propertyKey));
  };
}
