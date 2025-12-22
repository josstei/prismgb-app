/**
 * Pass 3: Color Elevation Fragment Shader (WebGL2 - GLSL ES 3.0)
 *
 * Enhances colors for modern HD displays while maintaining GBC authenticity.
 */

#version 300 es
precision highp float;

// Uniforms
uniform sampler2D uInputTex;
uniform float uGamma;          // Gamma correction (0.8 - 1.2)
uniform float uSaturation;     // Saturation multiplier (0.5 - 1.5)
uniform float uGreenBias;      // GBC green tint (0.0 - 0.1)
uniform float uBrightness;     // Brightness multiplier (0.8 - 1.2)
uniform float uContrast;       // Contrast multiplier (0.8 - 1.3)

// Input from vertex shader
in vec2 vUV;

// Output color
out vec4 fragColor;

/**
 * Convert RGB to HSV color space
 */
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;

  return vec3(
    abs(q.z + (q.w - q.y) / (6.0 * d + e)),
    d / (q.x + e),
    q.x
  );
}

/**
 * Convert HSV to RGB color space
 */
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec4 color = texture(uInputTex, vUV);

  // Step 1: Gamma correction
  color.rgb = pow(color.rgb, vec3(uGamma));

  // Step 2: Contrast adjustment
  color.rgb = (color.rgb - 0.5) * uContrast + 0.5;

  // Step 3: Brightness adjustment
  color.rgb *= uBrightness;

  // Step 4: Saturation adjustment in HSV space
  if (uSaturation != 1.0) {
    vec3 hsv = rgb2hsv(color.rgb);
    hsv.y = clamp(hsv.y * uSaturation, 0.0, 1.0);
    color.rgb = hsv2rgb(hsv);
  }

  // Step 5: GBC green bias
  if (uGreenBias > 0.0) {
    color.g = color.g + uGreenBias * (1.0 - color.g);
  }

  // Final clamp
  fragColor = clamp(color, vec4(0.0), vec4(1.0));
}
