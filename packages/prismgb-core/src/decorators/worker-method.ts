import { addWorkerMethod } from '../metadata/worker-method-metadata';

export function WorkerMethod(): MethodDecorator {
  return (target, propertyKey) => {
    addWorkerMethod(target.constructor, { methodName: String(propertyKey) });
  };
}
