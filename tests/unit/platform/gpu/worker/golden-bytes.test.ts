import { beforeEach, describe, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { WorkerRendererClient } from '../../../../../src/platform/gpu/worker/client';
import { startWorkerRendererService } from '../../../../../src/platform/gpu/worker/service';
import {
  createRecordingDriver,
  makeDeterministicFrame,
  hashRecord,
  FakeWorker,
  flush,
  type WorkerServiceScope
} from './golden-harness';

const { mockCreateGpuRenderer, mockResolvePreset } = vi.hoisted(() => ({
  mockCreateGpuRenderer: vi.fn(),
  mockResolvePreset: vi.fn()
}));

vi.mock('../../../../../src/platform/gpu/application/renderer.service', () => ({
  createGpuRenderer: mockCreateGpuRenderer
}));
vi.mock('../../../../../src/platform/gpu/application/catalog', () => ({
  resolvePreset: mockResolvePreset
}));

const AUTHENTIC_PRESET = { id: 'authentic', name: 'Authentic' } as never;
const VIBRANT_PRESET = { id: 'vibrant', name: 'Vibrant' } as never;

function config() {
  return {
    nativeWidth: 160,
    nativeHeight: 144,
    targetWidth: 640,
    targetHeight: 576,
    scaleFactor: 4,
    backend: 'webgpu' as const,
    presetId: 'vibrant'
  };
}

function mockCanvas() {
  const offscreen = { width: 160, height: 144, getContext: () => null };
  return {
    width: 160,
    height: 144,
    getContext: () => null,
    transferControlToOffscreen: () => offscreen
  } as unknown as HTMLCanvasElement;
}

// Golden constant recorded on the UNMODIFIED tree; must remain identical post-port.
const GOLDEN_HASH = 'afa9ed05';

async function driveDeterministicSession(frameCount: number): Promise<string[]> {
  const driver = createRecordingDriver(mockCreateGpuRenderer);
  const worker = new FakeWorker();
  startWorkerRendererService(worker.scope as unknown as WorkerServiceScope);
  const client = new WorkerRendererClient({
    createWorker: () => worker as unknown as Worker,
    logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn() }
  });

  await client.initialize(mockCanvas(), config(), 5000);
  await flush();

  client.setBrightness(1.5);
  await flush();
  client.setPreset('authentic', AUTHENTIC_PRESET);
  await flush();
  client.resize(320, 288, 2);
  await flush();

  for (let i = 0; i < frameCount; i++) {
    client.renderFrame(makeDeterministicFrame(i));
    await flush(2);
  }
  await flush();

  client.dispose();
  await flush();
  return driver.record;
}

describe('golden byte-test (worker RPC driver-call parity)', () => {
  beforeEach(() => {
    mockResolvePreset.mockReturnValue(VIBRANT_PRESET);
  });

  it('produces the recorded golden hash for a deterministic session', async () => {
    const record = await driveDeterministicSession(8);
    const hash = hashRecord(record);
    writeFileSync('/tmp/spike-golden-out.txt', `hash=${hash}\nrecord=${JSON.stringify(record, null, 0)}\n`);
    expect(record.length).toBe(13);
    expect(hash).toBe(GOLDEN_HASH);
  });
});
