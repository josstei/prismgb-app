import { selectRenderBackend } from './backend-selection';
import { getPackageDefaultPreset } from './preset-catalog';
import { createCanvas2DRenderPipeline } from './canvas2d-render-pipeline';
import { RecoverableBackendInitializationError } from '../domain/errors';
import type { RenderBackend, RenderCapabilities, RenderPipeline, RenderPipelineConfig } from '../domain/types';

export interface CreateRenderPipelineOptions extends RenderPipelineConfig {
  capabilities?: RenderCapabilities;
}

function createBaseConfig(options: CreateRenderPipelineOptions) {
  return {
    canvas: options.canvas,
    nativeWidth: options.nativeWidth,
    nativeHeight: options.nativeHeight,
    preset: options.preset ?? getPackageDefaultPreset()
  };
}

async function detectDefaultCapabilities(): Promise<RenderCapabilities> {
  const { detectBrowserGpuCapabilities } = await import('../infrastructure/capabilities.browser');
  return detectBrowserGpuCapabilities();
}

function isRecoverableBackendInitializationError(error: unknown): boolean {
  return error instanceof RecoverableBackendInitializationError;
}

const BACKEND_FALLBACKS: Record<RenderBackend, readonly RenderBackend[]> = {
  webgpu: ['webgpu', 'webgl2', 'canvas2d'],
  webgl2: ['webgl2', 'canvas2d'],
  canvas2d: ['canvas2d']
};

async function initializeBackendPipeline(
  backend: RenderBackend,
  pipeline: RenderPipeline
): Promise<RenderPipeline | null> {
  try {
    await pipeline.initialize();
    return pipeline;
  } catch (error) {
    await pipeline.dispose().catch(() => undefined);

    if (isRecoverableBackendInitializationError(error)) {
      return null;
    }

    throw new Error(`Failed to initialize ${backend} render pipeline`, { cause: error });
  }
}

export async function createRenderPipeline(options: CreateRenderPipelineOptions): Promise<RenderPipeline> {
  const allowCanvas2D = options.allowCanvas2D !== false;
  const capabilities = options.capabilities ?? await detectDefaultCapabilities();
  const preferredBackend = selectRenderBackend(capabilities, {
    preferredBackend: options.preferredBackend,
    allowCanvas2D
  });
  const baseConfig = createBaseConfig(options);

  const backendFallbacks = BACKEND_FALLBACKS[preferredBackend].filter((backend) => (
    allowCanvas2D || backend !== 'canvas2d'
  ));

  for (const backend of backendFallbacks) {
    if (backend === 'webgpu' && capabilities.webgpu) {
      const { WebGPUPipeline } = await import('../infrastructure/webgpu/webgpu-pipeline');
      const pipeline = new WebGPUPipeline(baseConfig);
      const initializedPipeline = await initializeBackendPipeline('webgpu', pipeline);
      if (initializedPipeline) return initializedPipeline;
      continue;
    }

    if (backend === 'webgl2' && capabilities.webgl2) {
      const { WebGL2Pipeline } = await import('../infrastructure/webgl2/webgl2-pipeline');
      const pipeline = new WebGL2Pipeline(baseConfig);
      const initializedPipeline = await initializeBackendPipeline('webgl2', pipeline);
      if (initializedPipeline) return initializedPipeline;
      continue;
    }

    if (backend === 'canvas2d') {
      return createCanvas2DRenderPipeline(options);
    }
  }

  if (allowCanvas2D) {
    return createCanvas2DRenderPipeline(options);
  }

  throw new RecoverableBackendInitializationError('No accelerated render backend available');
}
