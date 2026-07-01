/**
 * Pass 1: Pixel-Exact Upscale Shader (WebGPU)
 *
 * Performs integer scaling with texel-center locking for pixel-perfect rendering.
 * No interpolation - each source pixel maps to an exact N×N block of output pixels.
 *
 * Key features:
 * - NEAREST sampling only (no bilinear filtering)
 * - Texel-center snapping prevents floating-point drift
 * - Integer scale factors only (2×, 3×, 4×, etc.)
 */

// Uniform buffer for upscale parameters
struct UpscaleUniforms {
  sourceSize: vec2<f32>,    // Native resolution (160, 144)
  targetSize: vec2<f32>,    // Output resolution (e.g., 640, 576)
  scaleFactor: f32,         // Integer scale factor (e.g., 4.0)
  _padding: f32             // Alignment padding to match the package uniform layout
}

@group(0) @binding(0) var<uniform> uniforms: UpscaleUniforms;
@group(0) @binding(1) var sourceTex: texture_2d<f32>;
@group(0) @binding(2) var nearestSampler: sampler;

/**
 * Fragment shader - Pixel-exact upscale with texel-center locking
 *
 * Algorithm:
 * 1. Get the output pixel coordinate
 * 2. Divide by scale factor to find source texel
 * 3. Floor to snap to texel grid
 * 4. Add 0.5 to sample at exact texel center
 * 5. Normalize to UV space
 */
@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  // Get output pixel coordinate (integer)
  let outputPixel = floor(input.position.xy);

  // Map output pixel to source texel (integer division for pixel-perfect)
  // This ensures each source pixel maps to exactly scaleFactor×scaleFactor output pixels
  let sourceTexel = floor(outputPixel / uniforms.scaleFactor);

  // Sample at exact texel center to avoid any sub-pixel positioning
  // Adding 0.5 centers us in the texel
  let texelCenter = sourceTexel + vec2<f32>(0.5, 0.5);

  // Convert to normalized UV coordinates
  var uv = texelCenter / uniforms.sourceSize;

  // Flip Y: video frames have Y=0 at top, but position.y=0 at bottom
  uv.y = 1.0 - uv.y;

  // Sample with nearest-neighbor (sampler configured with nearest filtering)
  return textureSample(sourceTex, nearestSampler, uv);
}
