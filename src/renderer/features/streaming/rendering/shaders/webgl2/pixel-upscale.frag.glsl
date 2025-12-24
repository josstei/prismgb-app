#version 300 es
/**
 * Pass 1: Pixel-Exact Upscale Fragment Shader (WebGL2 - GLSL ES 3.0)
 *
 * Performs integer scaling with texel-center locking for pixel-perfect rendering.
 */

precision highp float;

// Uniforms
uniform sampler2D uSourceTex;
uniform vec2 uSourceSize;      // Native resolution (160, 144)
uniform vec2 uTargetSize;      // Output resolution
uniform float uScaleFactor;    // Integer scale factor

// Input from vertex shader
in vec2 vUV;

// Output color
out vec4 fragColor;

void main() {
  // Get output pixel coordinate (integer)
  vec2 outputPixel = floor(gl_FragCoord.xy);

  // Map output pixel to source texel (integer division for pixel-perfect)
  vec2 sourceTexel = floor(outputPixel / uScaleFactor);

  // Sample at exact texel center
  vec2 texelCenter = sourceTexel + vec2(0.5);

  // Convert to normalized UV coordinates
  vec2 uv = texelCenter / uSourceSize;

  // Flip Y: video frames have Y=0 at top, but gl_FragCoord.y=0 at bottom
  uv.y = 1.0 - uv.y;

  // Sample with nearest-neighbor (texture should be configured with GL_NEAREST)
  fragColor = texture(uSourceTex, uv);
}
