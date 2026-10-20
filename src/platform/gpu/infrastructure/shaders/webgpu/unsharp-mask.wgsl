// Pixel-art unsharp mask: the blur samples neighbors one scaled pixel away
// (texelSize * scaleFactor), so sharpening follows the pixel grid.

struct UnsharpUniforms {
  texelSize: vec2<f32>,     // 1.0 / texture size
  strength: f32,            // Sharpening strength (0.0 - 1.5)
  scaleFactor: f32          // Integer scale factor
}

@group(0) @binding(0) var<uniform> uniforms: UnsharpUniforms;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let center = textureSample(inputTex, linearSampler, input.uv);

  let pixelOffset = uniforms.texelSize * uniforms.scaleFactor;

  let left = textureSample(inputTex, linearSampler, input.uv - vec2<f32>(pixelOffset.x, 0.0));
  let right = textureSample(inputTex, linearSampler, input.uv + vec2<f32>(pixelOffset.x, 0.0));
  let top = textureSample(inputTex, linearSampler, input.uv - vec2<f32>(0.0, pixelOffset.y));
  let bottom = textureSample(inputTex, linearSampler, input.uv + vec2<f32>(0.0, pixelOffset.y));

  let blurred = (left + right + top + bottom) * 0.25;

  let detail = center - blurred;
  let sharpened = center + detail * uniforms.strength;

  return clamp(sharpened, vec4<f32>(0.0), vec4<f32>(1.0));
}
