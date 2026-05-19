// =============================================================================
// @prismgb/gpu - GPU Rendering Pipeline Package
// =============================================================================
// This is the PUBLIC API. Only exports listed here are available to consumers.
// Internal implementation details are not exposed.
// =============================================================================

// Domain Types (for typing only)
export type {
  IPipeline,
  IPipelineConfig,
  IPipelineCapabilities,
  IPipelineStats,
  RenderAPI,
  WebGPULimits,
  WebGL2Info
} from './domain/pipeline';

export type {
  IPreset,
  UpscaleConfig,
  UnsharpConfig,
  ColorConfig,
  CRTConfig
} from './domain/presets';

export type {
  PipelineUniforms,
  UpscaleUniforms,
  UnsharpUniforms,
  ColorUniforms,
  CRTUniforms
} from './domain/shaders';

export type {
  FrameSource,
  IFrameProvider
} from './domain/frame';

// Preset Registry (for UI to list/select presets)
export { PresetRegistry } from './domain/presets';

// Capability Detection (for UI to show GPU status)
export { detectCapabilities } from './application/capability-detector';

// Uniform Builder (for building shader uniforms from presets)
export { buildUniforms, calculateScaleFactor } from './application/uniform-builder';
export type { UniformBuildContext } from './application/uniform-builder';

// Worker API (worker-safe rendering API)
export { createWorkerPipeline, type CreateWorkerPipelineOptions } from './factories';

// Pipeline Factory (main entry point)
export { createPipeline, type CreatePipelineOptions } from './factories';

import { BUILT_IN_PRESETS } from './domain/presets';
import { PresetRegistry } from './domain/presets';

PresetRegistry.registerMany(BUILT_IN_PRESETS);
