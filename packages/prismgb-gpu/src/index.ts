// =============================================================================
// @prismgb/gpu - GPU Rendering Pipeline Package
// =============================================================================
// This is the PUBLIC API. Only exports listed here are available to consumers.
// Internal implementation details are not exposed.
// =============================================================================

// Domain Types (for typing only)
export type {
  RenderPipeline,
  RenderPipelineConfig,
  RenderCapabilities,
  RenderStats,
  RenderBackend,
  RenderCanvas,
  RenderPreset,
  RenderPresetSummary,
  ShaderPresetCatalog,
  WebGPULimits
} from './domain/types';
export { RecoverableBackendInitializationError } from './domain/errors';

export { PRESET_POLICY } from './domain/presets';
export type { PresetPolicy } from './domain/presets';

export {
  getRendererDefaultPreset,
  getUiPresets,
  resolvePreset
} from './application/catalog';
