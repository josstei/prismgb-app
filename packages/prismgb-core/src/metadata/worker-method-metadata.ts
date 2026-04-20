import 'reflect-metadata';
import { METADATA_KEYS } from './metadata-keys';

export interface WorkerMethodMetadata {
  methodName: string;
}

export function addWorkerMethod(target: object, metadata: WorkerMethodMetadata): void {
  const existing = (Reflect.getMetadata(METADATA_KEYS.WORKER_METHODS, target) as WorkerMethodMetadata[] | undefined) ?? [];
  Reflect.defineMetadata(METADATA_KEYS.WORKER_METHODS, [...existing, metadata], target);
}

export function getWorkerMethodMetadata(target: object): WorkerMethodMetadata[] {
  return (Reflect.getMetadata(METADATA_KEYS.WORKER_METHODS, target) as WorkerMethodMetadata[] | undefined) ?? [];
}
