import { getPackageDefaultPreset } from './catalog';
import { RecoverableBackendInitializationError } from '../domain/errors';
import type { RenderBackend, RenderCapabilities, RenderPipeline, RenderPipelineConfig } from '../domain/types';
import { CanvasRenderer } from '../infrastructure/canvas.renderer';

export interface CreateGpuRendererOptions extends RenderPipelineConfig {
  capabilities?: RenderCapabilities;
}

function createBaseConfig(options: CreateGpuRendererOptions) {
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

function selectGpuRendererBackend(
  capabilities: RenderCapabilities,
  preferredBackend: RenderBackend | undefined,
  allowCanvas2D: boolean
): RenderBackend {
  const requestedBackend = preferredBackend ?? capabilities.preferredBackend;

  if (requestedBackend === 'webgpu' && capabilities.webgpu) {
    return 'webgpu';
  }
  if (requestedBackend === 'canvas2d' && allowCanvas2D) {
    return 'canvas2d';
  }
  if (capabilities.webgpu) {
    return 'webgpu';
  }
  if (!allowCanvas2D) {
    return requestedBackend;
  }
  return 'canvas2d';
}

function isRecoverableBackendInitializationError(error: unknown): boolean {
  return error instanceof RecoverableBackendInitializationError;
}

const BACKEND_FALLBACKS: Record<RenderBackend, readonly RenderBackend[]> = {
  webgpu: ['webgpu', 'canvas2d'],
  canvas2d: ['canvas2d']
};

async function initializeBackendRenderer(
  backend: RenderBackend,
  renderer: RenderPipeline
): Promise<RenderPipeline | null> {
  try {
    await renderer.initialize();
    return renderer;
  } catch (error) {
    await renderer.dispose().catch(() => undefined);

    if (isRecoverableBackendInitializationError(error)) {
      return null;
    }

    throw new Error(`Failed to initialize ${backend} renderer`, { cause: error });
  }
}

async function createCanvasRenderer(options: CreateGpuRendererOptions): Promise<RenderPipeline> {
  const renderer = new CanvasRenderer({
    canvas: options.canvas,
    nativeWidth: options.nativeWidth,
    nativeHeight: options.nativeHeight,
    preset: options.preset ?? getPackageDefaultPreset()
  });
  await renderer.initialize();
  return renderer;
}

export async function createGpuRenderer(options: CreateGpuRendererOptions): Promise<RenderPipeline> {
  const allowCanvas2D = options.allowCanvas2D !== false;
  const capabilities = options.capabilities ?? await detectDefaultCapabilities();
  const preferredBackend = selectGpuRendererBackend(
    capabilities,
    options.preferredBackend,
    allowCanvas2D
  );
  const baseConfig = createBaseConfig(options);

  const backendFallbacks = BACKEND_FALLBACKS[preferredBackend].filter((backend) => (
    allowCanvas2D || backend !== 'canvas2d'
  ));

  for (const backend of backendFallbacks) {
    if (backend === 'webgpu' && capabilities.webgpu) {
      const { WebGpuRenderer } = await import('../infrastructure/webgpu.renderer');
      const renderer = new WebGpuRenderer(baseConfig);
      const initializedRenderer = await initializeBackendRenderer('webgpu', renderer);
      if (initializedRenderer) return initializedRenderer;
      continue;
    }

    if (backend === 'canvas2d') {
      return createCanvasRenderer(options);
    }
  }

  if (allowCanvas2D) {
    return createCanvasRenderer(options);
  }

  throw new RecoverableBackendInitializationError('No accelerated render backend available');
}
