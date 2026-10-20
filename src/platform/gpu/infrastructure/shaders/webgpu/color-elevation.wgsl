// Color elevation for modern displays: gamma, contrast, brightness, HSV
// saturation and the characteristic GBC green bias, applied in that order.

struct ColorUniforms {
  gamma: f32,               // Gamma correction (0.8 - 1.2, lower = brighter)
  saturation: f32,          // Saturation multiplier (0.5 - 1.5)
  greenBias: f32,           // GBC green tint amount (0.0 - 0.1)
  brightness: f32,          // Brightness multiplier (0.8 - 1.2)
  contrast: f32,            // Contrast multiplier (0.8 - 1.3)
  _padding1: f32,           // Alignment padding
  _padding2: f32,
  _padding3: f32
}

@group(0) @binding(0) var<uniform> uniforms: ColorUniforms;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;

fn rgb2hsv(c: vec3<f32>) -> vec3<f32> {
  let K = vec4<f32>(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  let p = mix(vec4<f32>(c.bg, K.wz), vec4<f32>(c.gb, K.xy), step(c.b, c.g));
  let q = mix(vec4<f32>(p.xyw, c.r), vec4<f32>(c.r, p.yzx), step(p.x, c.r));

  let d = q.x - min(q.w, q.y);
  let e = 1.0e-10;

  return vec3<f32>(
    abs(q.z + (q.w - q.y) / (6.0 * d + e)),
    d / (q.x + e),
    q.x
  );
}

fn hsv2rgb(c: vec3<f32>) -> vec3<f32> {
  let K = vec4<f32>(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  let p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, vec3<f32>(0.0), vec3<f32>(1.0)), c.y);
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  var color = textureSample(inputTex, linearSampler, input.uv);

  // GBC displays had a gamma around 0.88-0.95 compared to modern displays.
  color = vec4<f32>(pow(color.rgb, vec3<f32>(uniforms.gamma)), color.a);

  color = vec4<f32>(
    (color.rgb - vec3<f32>(0.5)) * uniforms.contrast + vec3<f32>(0.5),
    color.a
  );

  color = vec4<f32>(color.rgb * uniforms.brightness, color.a);

  if (uniforms.saturation != 1.0) {
    var hsv = rgb2hsv(color.rgb);
    hsv.y = hsv.y * uniforms.saturation;
    hsv.y = clamp(hsv.y, 0.0, 1.0);
    color = vec4<f32>(hsv2rgb(hsv), color.a);
  }

  // The GBC LCD had a green tint. Scaling the bias by the distance from full
  // green keeps pure white from turning green.
  if (uniforms.greenBias > 0.0) {
    color.g = color.g + uniforms.greenBias * (1.0 - color.g);
  }

  return clamp(color, vec4<f32>(0.0), vec4<f32>(1.0));
}
