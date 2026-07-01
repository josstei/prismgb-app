/**
 * Present pass (WebGPU)
 *
 * Copies the final rendered intermediate texture to the visible canvas as an
 * explicit, dedicated presentation step. Effect passes always render to
 * intermediate targets; this pass is the only one that writes to the canvas,
 * so no effect pass (previously crt-lcd) doubles as the presenter.
 *
 * It is a 1:1 linear passthrough: the intermediate and the canvas share the
 * output resolution, so sampling at texel centers reproduces the source exactly.
 */

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let clampedUV = clamp(input.uv, vec2<f32>(0.0), vec2<f32>(1.0));
  return clamp(textureSample(inputTex, inputSampler, clampedUV), vec4<f32>(0.0), vec4<f32>(1.0));
}
