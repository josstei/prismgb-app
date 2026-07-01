import type { RenderBackend, RenderCapabilities } from '../domain/types';

export type RenderBackendSelectionPolicy = {
  readonly preferredBackend?: RenderBackend;
  readonly allowCanvas2D?: boolean;
};

export function selectRenderBackend(
  capabilities: RenderCapabilities,
  policy: RenderBackendSelectionPolicy = {}
): RenderBackend {
  const preferredBackend = policy.preferredBackend ?? capabilities.preferredBackend;

  if (preferredBackend === 'webgpu' && capabilities.webgpu) {
    return 'webgpu';
  }
  if (preferredBackend === 'webgl2' && capabilities.webgl2) {
    return 'webgl2';
  }
  if (preferredBackend === 'canvas2d' && policy.allowCanvas2D !== false) {
    return 'canvas2d';
  }
  if (capabilities.webgpu) {
    return 'webgpu';
  }
  if (capabilities.webgl2) {
    return 'webgl2';
  }
  if (policy.allowCanvas2D === false) {
    return preferredBackend;
  }
  return 'canvas2d';
}
