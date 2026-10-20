// Copies the final intermediate texture to the canvas.

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let clampedUV = clamp(input.uv, vec2<f32>(0.0), vec2<f32>(1.0));
  return clamp(textureSample(inputTex, inputSampler, clampedUV), vec4<f32>(0.0), vec4<f32>(1.0));
}
