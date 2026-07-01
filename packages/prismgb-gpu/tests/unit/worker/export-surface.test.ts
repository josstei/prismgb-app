import { describe, expect, it } from 'vitest';

describe('@prismgb/gpu/worker export surface', () => {
  it('exports worker client, protocol, and runtime installer APIs', async () => {
    const worker = await import('@prismgb/gpu/worker');

    expect(worker.WorkerRendererClient).toEqual(expect.any(Function));
    expect(worker.createWorkerPipeline).toEqual(expect.any(Function));
    expect(worker.installWorkerRenderer).toEqual(expect.any(Function));
    expect(worker.WorkerMessageType.FRAME).toBe('frame');
    expect(worker.WorkerResponseType.READY).toBe('ready');
    expect(worker.isWorkerRenderBackend('webgpu')).toBe(true);
  });
});
