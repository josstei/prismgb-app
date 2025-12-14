/**
 * Pass 4: CRT/LCD Simulation Fragment Shader (WebGL2 - GLSL ES 3.0)
 *
 * Optional retro display effects: scanlines, pixel mask, bloom, curvature, vignette.
 */

#version 300 es
precision highp float;

// Mathematical constant
const float PI = 3.14159265359;

// Uniforms
uniform sampler2D uInputTex;
uniform vec2 uResolution;          // Output resolution
uniform float uScaleFactor;        // Integer scale factor
uniform float uScanlineStrength;   // Horizontal scanlines (0.0 - 0.5)
uniform float uPixelMaskStrength;  // RGB subpixel mask (0.0 - 0.4)
uniform float uBloomStrength;      // Glow on bright areas (0.0 - 0.3)
uniform float uCurvature;          // Barrel distortion (0.0 - 0.1)
uniform float uVignetteStrength;   // Corner darkening (0.0 - 0.4)

// Input from vertex shader
in vec2 vUV;

// Output color
out vec4 fragColor;

/**
 * Apply barrel distortion
 */
vec2 applyCurvature(vec2 uv, float curvature) {
  vec2 centered = uv * 2.0 - 1.0;
  vec2 offset = centered.yx * centered.yx * curvature;
  centered = centered + centered * offset;
  return centered * 0.5 + 0.5;
}

/**
 * Calculate scanline intensity
 */
float getScanlineIntensity(float y, float strength) {
  float scanline = sin(y * PI) * 0.5 + 0.5;
  return 1.0 - strength * (1.0 - scanline);
}

/**
 * Calculate RGB pixel mask
 */
vec3 getPixelMask(float x, float strength) {
  int subpixel = int(floor(x)) % 3;
  vec3 mask = vec3(1.0);

  if (subpixel == 0) {
    mask = vec3(1.0, 1.0 - strength, 1.0 - strength);
  } else if (subpixel == 1) {
    mask = vec3(1.0 - strength, 1.0, 1.0 - strength);
  } else {
    mask = vec3(1.0 - strength, 1.0 - strength, 1.0);
  }

  return mask;
}

/**
 * Calculate bloom contribution
 */
float getBloom(vec3 color, float strength) {
  float luminance = dot(color, vec3(0.299, 0.587, 0.114));
  float threshold = 0.7;
  return max(luminance - threshold, 0.0) * strength;
}

/**
 * Calculate vignette
 */
float getVignette(vec2 uv, float strength) {
  vec2 center = uv - 0.5;
  float distSq = dot(center, center);
  return 1.0 - distSq * strength * 4.0;
}

void main() {
  vec2 uv = vUV;

  // Step 1: Apply barrel distortion
  if (uCurvature > 0.0) {
    uv = applyCurvature(uv, uCurvature);

    // Discard pixels outside curved area
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      fragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
  }

  // Sample input texture
  vec4 color = texture(uInputTex, uv);

  // Calculate pixel position
  vec2 pixelPos = uv * uResolution;

  // Step 2: Apply scanlines
  if (uScanlineStrength > 0.0) {
    float scanlineFactor = getScanlineIntensity(pixelPos.y, uScanlineStrength);
    color.rgb *= scanlineFactor;
  }

  // Step 3: Apply pixel mask
  if (uPixelMaskStrength > 0.0) {
    vec3 mask = getPixelMask(pixelPos.x, uPixelMaskStrength);
    color.rgb *= mask;
  }

  // Step 4: Apply bloom
  if (uBloomStrength > 0.0) {
    float bloom = getBloom(color.rgb, uBloomStrength);
    color.rgb += bloom;
  }

  // Step 5: Apply vignette
  if (uVignetteStrength > 0.0) {
    float vignette = getVignette(uv, uVignetteStrength);
    color.rgb *= vignette;
  }

  // Final clamp
  fragColor = clamp(color, vec4(0.0), vec4(1.0));
}
