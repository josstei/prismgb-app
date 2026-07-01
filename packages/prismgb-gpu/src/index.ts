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

export type {
  PipelineUniforms,
  UpscaleUniforms,
  UnsharpUniforms,
  ColorUniforms,
  CRTUniforms
} from './domain/uniforms';

export {
  BUILT_IN_PRESET_CATALOG,
  BUILT_IN_PRESETS,
  PRESET_POLICY
} from './domain/presets';
export type { PresetPolicy } from './domain/presets';

export {
  createShaderPresetCatalog,
  getAllPresets,
  getPackageDefaultPreset,
  getPreset,
  getRendererDefaultPreset,
  getUiPresets,
  resolvePreset
} from './application/catalog';

// Uniform Builder (for building shader uniforms from presets)
export { buildUniforms, calculateScaleFactor } from './application/uniform-builder';
export type { UniformBuildContext } from './application/uniform-builder';
