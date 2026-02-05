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
  FrameSource,
  IFrameProvider
} from './domain/frame';

// Preset Registry (for UI to list/select presets)
export { PresetRegistry } from './domain/presets';

// Capability Detection (for UI to show GPU status)
export { detectCapabilities } from './application/capability-detector';

// Pipeline Factory (main entry point)
export { createPipeline, type CreatePipelineOptions } from './factories';

// Register all built-in presets on import
import './domain/presets/presets/true-color.preset';
import './domain/presets/presets/vibrant.preset';
import './domain/presets/presets/hi-def.preset';
import './domain/presets/presets/vintage.preset';
import './domain/presets/presets/pixel.preset';
import './domain/presets/presets/performance.preset';
