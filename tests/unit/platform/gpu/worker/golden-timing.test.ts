import { beforeEach, describe, it, vi } from 'vitest';
import { appendFileSync, writeFileSync } from 'node:fs';
import { WorkerRendererClient } from '../../../../../src/platform/gpu/worker/client';
import { startWorkerRendererService } from '../../../../../src/platform/gpu/worker/service';
import {
  createRecordingDriver,
  makeDeterministicFrame,
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

const PRESET = { id: 'authentic' } as never;
const VIBRANT = { id: 'vibrant' } as never;
const OUT = '/tmp/spike-timing-out.txt';

function config() {
  return {
    nativeWidth: 160, nativeHeight: 144, targetWidth: 640, targetHeight: 576,
    scaleFactor: 4, backend: 'webgpu' as const, presetId: 'vibrant'
  };
}
function mockCanvas() {
  const offscreen = { width: 160, height: 144, getContext: () => null };
  return { width: 160, height: 144, getContext: () => null, transferControlToOffscreen: () => offscreen } as unknown as HTMLCanvasElement;
}

/**
 * Frame-dominated session: 1 init + a few control calls + many frames — mirrors the 60fps hot path.
 */
async function runFrameDominatedSession(frameCount: number): Promise<void> {
  createRecordingDriver(mockCreateGpuRenderer);
  const worker = new FakeWorker();
  startWorkerRendererService(worker.scope as unknown as WorkerServiceScope);
  const client = new WorkerRendererClient({
    createWorker: () => worker as unknown as Worker,
    logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn() }
  });
  await client.initialize(mockCanvas(), config(), 5000);
  await flush();
  client.setBrightness(1.5); client.setPreset('authentic', PRESET); client.resize(320, 288, 2);
  await flush();
  for (let i = 0; i < frameCount; i++) {
    client.renderFrame(makeDeterministicFrame(i));
    await flush(1);
  }
  await flush();
  client.dispose();
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

describe('golden timing (frame-dominated wall-clock)', () => {
  beforeEach(() => { mockResolvePreset.mockReturnValue(VIBRANT); });

  it('measures median bracketed wall-clock over many iterations', async () => {
    const FRAMES = 200;
    const ITERS = 15;
    const WARMUP = 3;
    const samples: number[] = [];
    for (let i = 0; i < ITERS + WARMUP; i++) {
      const t0 = performance.now();
      await runFrameDominatedSession(FRAMES);
      const dt = performance.now() - t0;
      if (i >= WARMUP) samples.push(dt);
    }
    const med = median(samples);
    writeFileSync(OUT, `frames=${FRAMES} iters=${ITERS} medianMs=${med.toFixed(3)} samples=${samples.map((s) => s.toFixed(1)).join(',')}\n`);
    appendFileSync('/tmp/spike-timing-history.txt', `${new Date().toISOString()} median=${med.toFixed(3)}\n`);
  }, 60000);
});
