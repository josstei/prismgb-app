import { describe, expect, it } from 'vitest';
import {
  createPipelineUniformsFixture,
  createRenderCapabilitiesFixture,
  createRenderPresetFixture,
  createRenderStatsFixture,
  createWorkerRendererClientMock
} from '@platform/gpu/testkit';

describe('platform/gpu/testkit/fixtures', () => {
  it('creates overridable domain fixtures from final GPU types', () => {
    expect(createRenderStatsFixture({ fps: 60 })).toEqual({
      fps: 60,
      frameTime: 0,
      framesRendered: 0,
      framesDropped: 0
    });
    expect(createRenderCapabilitiesFixture({ preferredBackend: 'webgpu', webgpu: true })).toEqual(
      expect.objectContaining({
        preferredBackend: 'webgpu',
        webgpu: true
      })
    );
    expect(createRenderPresetFixture({ color: { enabled: false } }).color.enabled).toBe(false);
    expect(createPipelineUniformsFixture({ upscale: { scaleFactor: 2 } }).upscale).toEqual({
      inputSize: [160, 144],
      outputSize: [640, 576],
      scaleFactor: 2
    });
  });

  it('creates an event-capable worker renderer client fixture', () => {
    const client = createWorkerRendererClientMock();
    const readyEvents: unknown[] = [];
    const unsubscribe = client.onReady((payload) => {
      readyEvents.push(payload);
    });

    expect(client.renderFrame({} as ImageBitmap)).toBe(true);

    client.emit('ready', { backend: 'webgpu' });
    unsubscribe();
    client.emit('ready', { backend: 'webgpu' });

    expect(readyEvents).toEqual([{ backend: 'webgpu' }]);
  });
});
