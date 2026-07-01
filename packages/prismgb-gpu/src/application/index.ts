export { selectRenderBackend, type RenderBackendSelectionPolicy } from './backend-selection';
export {
  createShaderPresetCatalog,
  getAllPresets,
  getPackageDefaultPreset,
  getPreset,
  getRendererDefaultPreset,
  getUiPresets,
  resolvePreset
} from './preset-catalog';
export { buildUniforms, calculateScaleFactor, type UniformBuildContext } from './uniform-builder';
export {
  createRenderPassPlan,
  type FinalCanvasCopyPlan,
  type PlannedRenderPass,
  type RenderPassPlan,
  type RenderPassPlanStep,
  type RenderPlanSource,
  type RenderPlanTarget
} from './render-plan';
export { createCanvas2DRenderPipeline } from './canvas2d-render-pipeline';
export {
  createRenderPipeline,
  type CreateRenderPipelineOptions
} from './render-pipeline';
