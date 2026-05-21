import {
  createShaderSourceMap,
  type ShaderSourceMap
} from '../shader-source-map';

const WEBGL2_SHADER_MODULES = import.meta.glob('./shaders/*.glsl', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

export type WebGL2Shaders = ShaderSourceMap;

export function loadShaders(): WebGL2Shaders {
  return createShaderSourceMap(WEBGL2_SHADER_MODULES);
}
