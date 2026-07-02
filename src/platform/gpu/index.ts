// =============================================================================
// @platform/gpu - GPU Rendering Pipeline Package
// =============================================================================
// This is the PUBLIC API. Only exports listed here are available to consumers.
// Internal implementation details are not exposed.
// =============================================================================

export type { RenderCapabilities } from './domain/types';

export { PRESET_POLICY } from './domain/presets';

export { getUiPresets, resolvePreset } from './application/catalog';

