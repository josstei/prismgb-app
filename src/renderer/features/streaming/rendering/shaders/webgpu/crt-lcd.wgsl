/**
 * Pass 4: CRT/LCD Simulation Shader (WebGPU)
 *
 * Optional pass that adds retro display effects:
 * - Scanlines (horizontal lines like CRT monitors)
 * - Pixel mask (RGB subpixel pattern like LCD panels)
 * - Bloom (glow around bright areas)
 * - Barrel distortion (curved screen effect)
 * - Vignette (darkened corners)
 *
 * All effects are tunable and can be disabled individually.
 */

// Uniform buffer for CRT/LCD parameters
struct CRTUniforms {
  resolution: vec2<f32>,        // Output resolution
  scaleFactor: f32,             // Integer scale factor
  scanlineStrength: f32,        // Horizontal scanline intensity (0.0 - 0.5)
  pixelMaskStrength: f32,       // RGB subpixel mask intensity (0.0 - 0.4)
  bloomStrength: f32,           // Glow around bright areas (0.0 - 0.3)
  curvature: f32,               // Barrel distortion amount (0.0 - 0.1)
  vignetteStrength: f32         // Corner darkening (0.0 - 0.4)
}

@group(0) @binding(0) var<uniform> uniforms: CRTUniforms;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;

// Mathematical constant
const PI: f32 = 3.14159265359;

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
 * Apply barrel distortion to UV coordinates
 * Simulates the curved surface of CRT monitors
 *
 * @param uv - Input UV coordinates (0-1 range)
 * @param curvature - Distortion amount (0 = none, 0.1 = strong)
 * @returns Distorted UV coordinates
 */
fn applyCurvature(uv: vec2<f32>, curvature: f32) -> vec2<f32> {
  // Convert to -1 to 1 range centered at screen middle
  var centered = uv * 2.0 - 1.0;

  // Apply barrel distortion
  // The offset is proportional to the square of the perpendicular axis
  let offset = centered.yx * centered.yx * curvature;
  centered = centered + centered * offset;

  // Convert back to 0-1 range
  return centered * 0.5 + 0.5;
}

/**
 * Calculate scanline intensity at given position
 * Creates horizontal dark lines that simulate CRT scanlines
 *
 * @param y - Vertical position in pixels
 * @returns Intensity multiplier (0.5 to 1.0 range with strength applied)
 */
fn getScanlineIntensity(y: f32, strength: f32) -> f32 {
  // Create sine wave pattern along vertical axis
  // Period is one pixel height for visible scanlines
  let scanline = sin(y * PI) * 0.5 + 0.5;

  // Apply strength - at 0 strength, factor is 1.0 (no effect)
  // at max strength, factor varies from (1-strength) to 1.0
  return 1.0 - strength * (1.0 - scanline);
}

/**
 * Calculate RGB pixel mask color
 * Simulates the RGB subpixel structure of LCD panels
 *
 * @param x - Horizontal position in pixels
 * @param strength - Mask intensity
 * @returns RGB mask multiplier
 */
fn getPixelMask(x: f32, strength: f32) -> vec3<f32> {
  // Determine which subpixel we're in (RGB stripe pattern)
  let subpixel = i32(floor(x)) % 3;

  // Create mask - the current subpixel is bright, others are dimmed
  var mask = vec3<f32>(1.0);

  if (subpixel == 0) {
    // Red subpixel - dim green and blue
    mask = vec3<f32>(1.0, 1.0 - strength, 1.0 - strength);
  } else if (subpixel == 1) {
    // Green subpixel - dim red and blue
    mask = vec3<f32>(1.0 - strength, 1.0, 1.0 - strength);
  } else {
    // Blue subpixel - dim red and green
    mask = vec3<f32>(1.0 - strength, 1.0 - strength, 1.0);
  }

  return mask;
}

/**
 * Calculate bloom contribution
 * Adds glow to bright areas of the image
 *
 * @param color - Input color
 * @param strength - Bloom intensity
 * @returns Bloom contribution to add
 */
fn getBloom(color: vec3<f32>, strength: f32) -> f32 {
  // Calculate luminance (perceptual brightness)
  let luminance = dot(color, vec3<f32>(0.299, 0.587, 0.114));

  // Only bloom pixels brighter than threshold
  let threshold = 0.7;
  let bloom = max(luminance - threshold, 0.0) * strength;

  return bloom;
}

/**
 * Calculate vignette darkening factor
 * Darkens corners and edges of the screen
 *
 * @param uv - UV coordinates
 * @param strength - Vignette intensity
 * @returns Brightness multiplier (1.0 at center, darker toward edges)
 */
fn getVignette(uv: vec2<f32>, strength: f32) -> f32 {
  // Calculate distance from center
  let center = uv - 0.5;
  let distSq = dot(center, center);

  // Apply vignette - darkens quadratically from center
  // The 4.0 multiplier controls falloff sharpness
  return 1.0 - distSq * strength * 4.0;
}

/**
 * Fragment shader - CRT/LCD simulation effects
 */
@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  var uv = input.uv;

  // Step 1: Apply barrel distortion (curved screen)
  // Note: We must sample the texture BEFORE any non-uniform control flow
  // because textureSample requires uniform control flow for derivative calculations
  if (uniforms.curvature > 0.0) {
    uv = applyCurvature(uv, uniforms.curvature);
  }

  // Sample the input texture (must be in uniform control flow)
  // Clamp UV to valid range to avoid sampling outside texture bounds
  let clampedUV = clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0));
  var color = textureSample(inputTex, linearSampler, clampedUV);

  // After sampling, we can use non-uniform control flow
  // Black out pixels outside the curved screen area
  if (uniforms.curvature > 0.0) {
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      return vec4<f32>(0.0, 0.0, 0.0, 1.0);
    }
  }

  // Calculate pixel position for effects
  let pixelPos = uv * uniforms.resolution;

  // Step 2: Apply scanlines (horizontal lines)
  if (uniforms.scanlineStrength > 0.0) {
    let scanlineFactor = getScanlineIntensity(pixelPos.y, uniforms.scanlineStrength);
    color = vec4<f32>(color.rgb * scanlineFactor, color.a);
  }

  // Step 3: Apply pixel mask (RGB subpixel pattern)
  if (uniforms.pixelMaskStrength > 0.0) {
    let mask = getPixelMask(pixelPos.x, uniforms.pixelMaskStrength);
    color = vec4<f32>(color.rgb * mask, color.a);
  }

  // Step 4: Apply bloom (glow on bright areas)
  if (uniforms.bloomStrength > 0.0) {
    let bloom = getBloom(color.rgb, uniforms.bloomStrength);
    color = vec4<f32>(color.rgb + bloom, color.a);
  }

  // Step 5: Apply vignette (corner darkening)
  if (uniforms.vignetteStrength > 0.0) {
    let vignette = getVignette(uv, uniforms.vignetteStrength);
    color = vec4<f32>(color.rgb * vignette, color.a);
  }

  // Final clamp to valid range
  return clamp(color, vec4<f32>(0.0), vec4<f32>(1.0));
}
