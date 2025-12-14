/**
 * Pass 2: Unsharp Mask Fragment Shader (WebGL2 - GLSL ES 3.0)
 *
 * Edge-aware sharpening that respects pixel boundaries.
 */

#version 300 es
precision highp float;

// Uniforms
uniform sampler2D uInputTex;
uniform vec2 uTexelSize;       // 1.0 / textureSize
uniform float uStrength;       // Sharpening strength (0.0 - 1.5)
uniform float uScaleFactor;    // Integer scale factor

// Input from vertex shader
in vec2 vUV;

// Output color
out vec4 fragColor;

void main() {
  // Early exit if sharpening is disabled
  if (uStrength <= 0.0) {
    fragColor = texture(uInputTex, vUV);
    return;
  }

  // Sample center pixel
  vec4 center = texture(uInputTex, vUV);

  // Calculate offset that respects pixel boundaries
  vec2 pixelOffset = uTexelSize * uScaleFactor;

  // Sample neighbors (cross pattern: N, S, E, W)
  vec4 left = texture(uInputTex, vUV - vec2(pixelOffset.x, 0.0));
  vec4 right = texture(uInputTex, vUV + vec2(pixelOffset.x, 0.0));
  vec4 top = texture(uInputTex, vUV - vec2(0.0, pixelOffset.y));
  vec4 bottom = texture(uInputTex, vUV + vec2(0.0, pixelOffset.y));

  // Create blurred version (simple box filter from cross samples)
  vec4 blurred = (left + right + top + bottom) * 0.25;

  // Apply unsharp mask formula:
  // sharpened = original + strength * (original - blurred)
  vec4 detail = center - blurred;
  vec4 sharpened = center + detail * uStrength;

  // Clamp to valid color range
  fragColor = clamp(sharpened, vec4(0.0), vec4(1.0));
}
