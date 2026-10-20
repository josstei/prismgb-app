// Integer upscale that samples each source texel at its center, so every
// source pixel becomes an exact scaleFactor x scaleFactor block.

struct UpscaleUniforms {
  inputSize: vec2<f32>,     // Native resolution (160, 144)
  outputSize: vec2<f32>,    // Scaled resolution (e.g. 640, 576)
  scaleFactor: f32,         // Integer scale factor
  _padding: f32             // Alignment padding
}

@group(0) @binding(0) var<uniform> uniforms: UpscaleUniforms;
@group(0) @binding(1) var sourceTex: texture_2d<f32>;
@group(0) @binding(2) var nearestSampler: sampler;

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let outputPixel = floor(input.position.xy);
  let sourceTexel = floor(outputPixel / uniforms.scaleFactor);
  let texelCenter = sourceTexel + vec2<f32>(0.5, 0.5);

  var uv = texelCenter / uniforms.inputSize;

  // Video frames have Y=0 at the top, but position.y=0 is at the bottom.
  uv.y = 1.0 - uv.y;

  return textureSample(sourceTex, nearestSampler, uv);
}
