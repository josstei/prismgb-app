import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { WorkerMethod } from '../../../src/decorators/worker-method';
import { getWorkerMethodMetadata } from '../../../src/metadata/worker-method-metadata';

describe('@WorkerMethod decorator', () => {
  it('marks a method as Comlink-exposable', () => {
    class Pipeline {
      @WorkerMethod()
      render() {}
    }
    const meta = getWorkerMethodMetadata(Pipeline);
    expect(meta).toHaveLength(1);
    expect(meta[0].methodName).toBe('render');
  });

  it('collects multiple @WorkerMethod methods', () => {
    class Pipeline {
      @WorkerMethod()
      initialize() {}
      @WorkerMethod()
      render() {}
      @WorkerMethod()
      destroy() {}
    }
    const meta = getWorkerMethodMetadata(Pipeline);
    expect(meta.map(m => m.methodName).sort()).toEqual(['destroy', 'initialize', 'render']);
  });

  it('returns empty array for class without @WorkerMethod methods', () => {
    class Plain {}
    expect(getWorkerMethodMetadata(Plain)).toEqual([]);
  });
});
