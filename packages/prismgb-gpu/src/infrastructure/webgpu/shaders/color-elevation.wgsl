/**
 * Pass 3: GBC Color Elevation Shader (WebGPU)
 *
 * Enhances colors for modern HD displays while maintaining GBC authenticity.
 * Applies gamma correction, saturation boost, and the characteristic GBC green bias.
 *
 * Key features:
 * - Gamma correction to lift shadows and adjust overall brightness
 * - Saturation adjustment in HSV color space
 * - GBC-characteristic green channel bias
 * - Brightness and contrast controls
 */

// Uniform buffer for color parameters
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

// Vertex output structure
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>
}

/**
 * Vertex shader - Full-screen quad
 */
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

/**
 * Convert RGB to HSV color space
 * Used for saturation adjustment while preserving hue and value
 */
fn rgb2hsv(c: vec3<f32>) -> vec3<f32> {
  let K = vec4<f32>(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  let p = mix(vec4<f32>(c.bg, K.wz), vec4<f32>(c.gb, K.xy), step(c.b, c.g));
  let q = mix(vec4<f32>(p.xyw, c.r), vec4<f32>(c.r, p.yzx), step(p.x, c.r));

  let d = q.x - min(q.w, q.y);
  let e = 1.0e-10; // Epsilon to prevent division by zero

  // H = hue, S = saturation, V = value
  return vec3<f32>(
    abs(q.z + (q.w - q.y) / (6.0 * d + e)),
    d / (q.x + e),
    q.x
  );
}

/**
 * Convert HSV to RGB color space
 */
fn hsv2rgb(c: vec3<f32>) -> vec3<f32> {
  let K = vec4<f32>(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  let p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, vec3<f32>(0.0), vec3<f32>(1.0)), c.y);
}

/**
 * Fragment shader - Color elevation with GBC characteristics
 *
 * Processing order:
 * 1. Gamma correction (power curve)
 * 2. Contrast adjustment (around midpoint)
 * 3. Brightness adjustment (linear scale)
 * 4. Saturation boost (in HSV space)
 * 5. GBC green bias (characteristic tint)
 */
@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  var color = textureSample(inputTex, linearSampler, input.uv);

  // Step 1: Gamma correction
  // Lower gamma = brighter shadows, higher gamma = darker
  // GBC displays typically had gamma around 0.88-0.95 compared to modern displays
  color = vec4<f32>(pow(color.rgb, vec3<f32>(uniforms.gamma)), color.a);

  // Step 2: Contrast adjustment
  // Expand/compress values around the midpoint (0.5)
  // contrast > 1.0 = more contrast, < 1.0 = less contrast
  color = vec4<f32>(
    (color.rgb - vec3<f32>(0.5)) * uniforms.contrast + vec3<f32>(0.5),
    color.a
  );

  // Step 3: Brightness adjustment
  // Simple linear multiplication
  color = vec4<f32>(color.rgb * uniforms.brightness, color.a);

  // Step 4: Saturation adjustment in HSV space
  // This preserves hue while boosting/reducing color intensity
  if (uniforms.saturation != 1.0) {
    var hsv = rgb2hsv(color.rgb);
    hsv.y = hsv.y * uniforms.saturation; // Multiply saturation
    hsv.y = clamp(hsv.y, 0.0, 1.0);      // Clamp to valid range
    color = vec4<f32>(hsv2rgb(hsv), color.a);
  }

  // Step 5: GBC green bias
  // The original GBC LCD had a characteristic green tint
  // We add a subtle amount to the green channel, scaled by how far from white
  // This prevents pure white from becoming green-tinted
  if (uniforms.greenBias > 0.0) {
    color.g = color.g + uniforms.greenBias * (1.0 - color.g);
  }

  // Final clamp to ensure valid color output
  return clamp(color, vec4<f32>(0.0), vec4<f32>(1.0));
}
