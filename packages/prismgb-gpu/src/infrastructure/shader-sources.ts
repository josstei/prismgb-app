export interface ShaderSourceMap {
  byFileName: Record<string, string>;
}

export type WebGPUShaders = ShaderSourceMap;
export type WebGL2Shaders = ShaderSourceMap;

const WEBGPU_FULLSCREEN_VERTEX_SOURCE = `
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var positions = array<vec2<f32>, 4>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(1.0, 1.0)
  );

  var uvs = array<vec2<f32>, 4>(
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 0.0)
  );

  var output: VertexOutput;
  output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
  output.uv = uvs[vertexIndex];
  return output;
}
`;

const WEBGPU_SHADER_MODULES = import.meta.glob('./webgpu/shaders/*.wgsl', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

const WEBGL2_SHADER_MODULES = import.meta.glob('./webgl2/shaders/*.glsl', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

function createShaderSourceMap(
  modules: Record<string, string>,
  transformSource: (source: string) => string = (source) => source
): ShaderSourceMap {
  const entries = Object.entries(modules).map(([modulePath, source]) => {
    const fileName = modulePath.split('/').pop();
    if (!fileName) {
      throw new Error(`Invalid shader module path: ${modulePath}`);
    }

    if (typeof source !== 'string') {
      throw new Error(`Shader module '${modulePath}' did not resolve to source text`);
    }

    return [fileName, transformSource(source)] as const;
  });

  return {
    byFileName: Object.fromEntries(entries)
  };
}

function composeWebGPUShader(source: string): string {
  return `${WEBGPU_FULLSCREEN_VERTEX_SOURCE}\n${source}`;
}

export function loadWebGPUShaders(): WebGPUShaders {
  return createShaderSourceMap(WEBGPU_SHADER_MODULES, composeWebGPUShader);
}

export function loadWebGL2Shaders(): WebGL2Shaders {
  return createShaderSourceMap(WEBGL2_SHADER_MODULES);
}
