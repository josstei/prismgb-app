// Retro display effects: barrel curvature, scanlines, RGB pixel mask, bloom
// and vignette. Each effect is skipped when its strength is 0.

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

const PI: f32 = 3.14159265359;

fn applyCurvature(uv: vec2<f32>, curvature: f32) -> vec2<f32> {
  var centered = uv * 2.0 - 1.0;

  // The offset grows with the square of the perpendicular axis.
  let offset = centered.yx * centered.yx * curvature;
  centered = centered + centered * offset;

  return centered * 0.5 + 0.5;
}

fn getScanlineIntensity(y: f32, strength: f32) -> f32 {
  // One sine period per pixel row; the factor ranges from 1 - strength to 1.
  let scanline = sin(y * PI) * 0.5 + 0.5;
  return 1.0 - strength * (1.0 - scanline);
}

fn getPixelMask(x: f32, strength: f32) -> vec3<f32> {
  // RGB stripe pattern: the current subpixel stays bright, the others dim.
  let subpixel = i32(floor(x)) % 3;

  var mask = vec3<f32>(1.0);

  if (subpixel == 0) {
    mask = vec3<f32>(1.0, 1.0 - strength, 1.0 - strength);
  } else if (subpixel == 1) {
    mask = vec3<f32>(1.0 - strength, 1.0, 1.0 - strength);
  } else {
    mask = vec3<f32>(1.0 - strength, 1.0 - strength, 1.0);
  }

  return mask;
}

fn getBloom(color: vec3<f32>, strength: f32) -> f32 {
  let luminance = dot(color, vec3<f32>(0.299, 0.587, 0.114));

  let threshold = 0.7;
  let bloom = max(luminance - threshold, 0.0) * strength;

  return bloom;
}

fn getVignette(uv: vec2<f32>, strength: f32) -> f32 {
  let center = uv - 0.5;
  let distSq = dot(center, center);

  // The 4.0 multiplier controls the falloff sharpness.
  return 1.0 - distSq * strength * 4.0;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  var uv = input.uv;

  if (uniforms.curvature > 0.0) {
    uv = applyCurvature(uv, uniforms.curvature);
  }

  // textureSample needs uniform control flow for its derivatives, so sample
  // before any per-pixel branch. Clamping keeps the sample inside the texture.
  let clampedUV = clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0));
  var color = textureSample(inputTex, linearSampler, clampedUV);

  // Black out pixels that curvature pushed outside the screen.
  if (uniforms.curvature > 0.0) {
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      return vec4<f32>(0.0, 0.0, 0.0, 1.0);
    }
  }

  let pixelPos = uv * uniforms.resolution;

  if (uniforms.scanlineStrength > 0.0) {
    let scanlineFactor = getScanlineIntensity(pixelPos.y, uniforms.scanlineStrength);
    color = vec4<f32>(color.rgb * scanlineFactor, color.a);
  }

  if (uniforms.pixelMaskStrength > 0.0) {
    let mask = getPixelMask(pixelPos.x, uniforms.pixelMaskStrength);
    color = vec4<f32>(color.rgb * mask, color.a);
  }

  if (uniforms.bloomStrength > 0.0) {
    let bloom = getBloom(color.rgb, uniforms.bloomStrength);
    color = vec4<f32>(color.rgb + bloom, color.a);
  }

  if (uniforms.vignetteStrength > 0.0) {
    let vignette = getVignette(uv, uniforms.vignetteStrength);
    color = vec4<f32>(color.rgb * vignette, color.a);
  }

  return clamp(color, vec4<f32>(0.0), vec4<f32>(1.0));
}
