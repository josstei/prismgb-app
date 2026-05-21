import {
  createShaderSourceMap,
  type ShaderSourceMap
} from '../shader-source-map';

const WEBGPU_SHADER_MODULES = import.meta.glob('./shaders/*.wgsl', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

export type WebGPUShaders = ShaderSourceMap;

export function loadShaders(): WebGPUShaders {
  return createShaderSourceMap(WEBGPU_SHADER_MODULES);
}
