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
  _padding: f32             // Alignment padding (WGSL requires 16-byte alignment)
}

@group(0) @binding(0) var<uniform> uniforms: UpscaleUniforms;
@group(0) @binding(1) var sourceTex: texture_2d<f32>;
@group(0) @binding(2) var nearestSampler: sampler;

// Vertex output structure
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>
}

/**
 * Vertex shader - Full-screen quad using vertex index
 * Renders a quad covering the entire screen without vertex buffers
 */
@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  // Generate full-screen quad from vertex index (triangle strip)
  // Index: 0 = bottom-left, 1 = bottom-right, 2 = top-left, 3 = top-right
  var positions = array<vec2<f32>, 4>(
    vec2<f32>(-1.0, -1.0),  // 0: bottom-left
    vec2<f32>(1.0, -1.0),   // 1: bottom-right
    vec2<f32>(-1.0, 1.0),   // 2: top-left
    vec2<f32>(1.0, 1.0)     // 3: top-right
  );

  // UV coordinates (0,0 at top-left for standard texture orientation)
  var uvs = array<vec2<f32>, 4>(
    vec2<f32>(0.0, 1.0),    // 0: bottom-left
    vec2<f32>(1.0, 1.0),    // 1: bottom-right
    vec2<f32>(0.0, 0.0),    // 2: top-left
    vec2<f32>(1.0, 0.0)     // 3: top-right
  );

  var output: VertexOutput;
  output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
  output.uv = uvs[vertexIndex];
  return output;
}

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
