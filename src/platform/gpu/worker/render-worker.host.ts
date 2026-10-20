import { resolvePreset } from '../domain/presets.definitions';
import { WebGpuDriver } from '../infrastructure/webgpu.driver';
import type { RenderWorkerConfig, RenderWorkerRequest, RenderWorkerResponse } from './render-worker.contract';

export type RenderWorkerScope = {
  onmessage: ((event: MessageEvent<RenderWorkerRequest>) => void | Promise<void>) | null;
  postMessage(message: RenderWorkerResponse, transfer?: Transferable[]): void;
};

export function startRenderWorkerHost(scope: RenderWorkerScope): void {
  let renderer: WebGpuDriver | null = null;
  let captureRequested = false;

  const post = (response: RenderWorkerResponse, transfer: Transferable[] = []): void => {
    scope.postMessage(response, transfer);
  };

  const postError = (error: unknown): void => {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  };

  async function init(canvas: OffscreenCanvas, config: RenderWorkerConfig): Promise<void> {
    try {
      canvas.width = config.targetWidth;
      canvas.height = config.targetHeight;

      renderer = await WebGpuDriver.create(canvas, {
        nativeWidth: config.nativeWidth,
        nativeHeight: config.nativeHeight,
        preset: resolvePreset(config.presetId),
        brightness: config.brightness
      });

      post({ type: 'ready' });
    } catch (error) {
      postError(error);
    }
  }

  async function renderFrame(bitmap: ImageBitmap): Promise<void> {
    try {
      if (!renderer) return;

      renderer.renderFrame(bitmap);

      // A capture returns the first frame rendered after it was requested.
      if (captureRequested) {
        captureRequested = false;
        const captured = await renderer.captureFrame();
        post({ type: 'captured', bitmap: captured }, [captured]);
      }

      post({ type: 'frameRendered' });
    } catch (error) {
      postError(error);
    } finally {
      bitmap.close();
    }
  }

  function apply(update: (activeRenderer: WebGpuDriver) => void): void {
    if (!renderer) return;

    try {
      update(renderer);
    } catch (error) {
      postError(error);
    }
  }

  scope.onmessage = async ({ data }) => {
    switch (data.type) {
      case 'init':
        await init(data.canvas, data.config);
        break;
      case 'frame':
        await renderFrame(data.bitmap);
        break;
      case 'resize':
        apply((activeRenderer) => activeRenderer.resize(data.width, data.height));
        break;
      case 'setPreset':
        apply((activeRenderer) => activeRenderer.setPreset(resolvePreset(data.presetId)));
        break;
      case 'setBrightness':
        apply((activeRenderer) => activeRenderer.setBrightness(data.brightness));
        break;
      case 'capture':
        if (renderer) {
          captureRequested = true;
        } else {
          post({ type: 'error', message: 'Capture renderer not initialized' });
        }
        break;
    }
  };
}
