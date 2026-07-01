import { describe, expect, it } from 'vitest';
import {
  createMockCanvas,
  createMockOffscreenCanvas,
  createMockWebGL2Context,
  createPipelineUniformsFixture,
  createRenderCapabilitiesFixture,
  createRenderPresetFixture,
  createRenderStatsFixture,
  createWorkerRendererClientMock
} from '@prismgb/gpu/testkit';

describe('@prismgb/gpu/testkit fixtures', () => {
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
        webgpu: true,
        webgl2: true
      })
    );
    expect(createRenderPresetFixture({ color: { enabled: false } }).color.enabled).toBe(false);
    expect(createPipelineUniformsFixture({ upscale: { scaleFactor: 2 } }).upscale).toEqual({
      inputSize: [160, 144],
      outputSize: [640, 576],
      scaleFactor: 2
    });
  });

  it('creates canvas and WebGL2 fixtures without a test-runner dependency', () => {
    const context = createMockWebGL2Context();
    const canvas = createMockCanvas(320, 288, { webgl2: context });
    const offscreen = createMockOffscreenCanvas(320, 288, { webgl2: context });

    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(288);
    expect(canvas.getContext('webgl2')).toBe(context);
    expect(canvas.transferControlToOffscreen().width).toBe(320);
    expect(offscreen.getContext('webgl2')).toBe(context);
    expect(context.getParameter(context.MAX_TEXTURE_SIZE)).toBe(8192);
  });

  it('creates an event-capable worker renderer client fixture', () => {
    const client = createWorkerRendererClientMock();
    const readyEvents: unknown[] = [];
    const unsubscribe = client.onReady((payload) => {
      readyEvents.push(payload);
    });

    expect(client.sendCommand('frame', {
      imageBitmap: {} as ImageBitmap,
      uniforms: createPipelineUniformsFixture()
    })).toBe(true);
    expect(client.renderFrame({} as ImageBitmap, createPipelineUniformsFixture())).toBe(true);

    client.emit('ready', { backend: 'webgl2' });
    unsubscribe();
    client.emit('ready', { backend: 'webgpu' });

    expect(readyEvents).toEqual([{ backend: 'webgl2' }]);
  });

  it('allows worker renderer client method overrides', () => {
    const client = createWorkerRendererClientMock({
      sendCommand: () => false
    });

    expect(client.sendCommand('release')).toBe(false);
  });
});
