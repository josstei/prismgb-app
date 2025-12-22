/**
 * Pass 2: Pixel-Art Unsharp Mask Shader (WebGPU)
 *
 * Increases microcontrast around edges without destroying pixel integrity.
 * Uses a simple cross-pattern neighbor sampling to create a blur for comparison.
 *
 * Key features:
 * - Edge-aware sharpening that respects pixel boundaries
 * - Tunable strength (0.0 = off, 1.0 = normal, up to 1.5)
 * - No halo artifacts at reasonable strength values
 * - Preserves the pixel-art aesthetic
 */

// Uniform buffer for unsharp mask parameters
struct UnsharpUniforms {
  texelSize: vec2<f32>,     // 1.0 / textureSize
  strength: f32,            // Sharpening strength (0.0 - 1.5)
  scaleFactor: f32          // Integer scale for pixel boundary detection
}

@group(0) @binding(0) var<uniform> uniforms: UnsharpUniforms;
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
 * Fragment shader - Unsharp mask with pixel-grid awareness
 *
 * Algorithm (Unsharp Mask):
 * 1. Sample center pixel
 * 2. Sample neighbors at pixel grid boundaries (not arbitrary positions)
 * 3. Create blurred version from neighbor average
 * 4. Sharpen: output = center + strength × (center - blurred)
 * 5. Clamp result to valid range
 *
 * The key difference from standard unsharp mask is that we sample
 * at pixel boundaries (scaled by scaleFactor) rather than arbitrary
 * distances, preserving the pixel-art grid structure.
 */
@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  // Early exit if sharpening is disabled
  if (uniforms.strength <= 0.0) {
    return textureSample(inputTex, linearSampler, input.uv);
  }

  // Sample center pixel
  let center = textureSample(inputTex, linearSampler, input.uv);

  // Calculate offset that respects pixel boundaries
  // We want to sample at the next/previous pixel, not at arbitrary distances
  let pixelOffset = uniforms.texelSize * uniforms.scaleFactor;

  // Sample neighbors (cross pattern: N, S, E, W)
  let left = textureSample(inputTex, linearSampler, input.uv - vec2<f32>(pixelOffset.x, 0.0));
  let right = textureSample(inputTex, linearSampler, input.uv + vec2<f32>(pixelOffset.x, 0.0));
  let top = textureSample(inputTex, linearSampler, input.uv - vec2<f32>(0.0, pixelOffset.y));
  let bottom = textureSample(inputTex, linearSampler, input.uv + vec2<f32>(0.0, pixelOffset.y));

  // Create blurred version (simple box filter from cross samples)
  let blurred = (left + right + top + bottom) * 0.25;

  // Apply unsharp mask formula:
  // sharpened = original + strength × (original - blurred)
  // This enhances the difference between the center and its surroundings
  let detail = center - blurred;
  let sharpened = center + detail * uniforms.strength;

  // Clamp to valid color range to prevent oversaturation/undersaturation
  return clamp(sharpened, vec4<f32>(0.0), vec4<f32>(1.0));
}
