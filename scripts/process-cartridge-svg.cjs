#!/usr/bin/env node
/**
 * Replace cartridge gem colors with default.svg rainbow pattern
 * Keeps same pixel positions, just updates colors to match default.svg spectrum
 */

const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '..', 'assets', 'overlay-icons');
const CARTRIDGE_PATH = path.join(ASSETS_DIR, 'cartridge_icon.svg');
const DEFAULT_PATH = path.join(ASSETS_DIR, 'default.svg');

// Parse SVG and extract pixel data
function parseSvgPixels(svgContent) {
  const pixels = [];
  const rectRegex = /<rect x="(\d+)" y="(\d+)" width="1" height="1" fill="(#[a-fA-F0-9]{6})"/g;

  let match;
  while ((match = rectRegex.exec(svgContent)) !== null) {
    pixels.push({
      x: parseInt(match[1]),
      y: parseInt(match[2]),
      color: match[3],
      original: match[0]
    });
  }
  return pixels;
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

// Check if color is a bright gem color (high saturation, not gray/dark)
function isGemColor(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;

  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  const saturation = max > 0 ? (max - min) / max : 0;

  // Gem colors are bright and saturated (not the blue screen #3b7eb7)
  return max > 120 && saturation > 0.35;
}

// Get color band (0-1) based on position in rainbow
function getColorBand(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;

  // Determine hue
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  const d = max - min;

  if (d === 0) return 0.5;

  let h;
  if (max === rgb.r) {
    h = ((rgb.g - rgb.b) / d) % 6;
  } else if (max === rgb.g) {
    h = (rgb.b - rgb.r) / d + 2;
  } else {
    h = (rgb.r - rgb.g) / d + 4;
  }

  h = h / 6;
  if (h < 0) h += 1;

  return h;
}

function main() {
  console.log('Reading SVG files...');
  const cartridgeSvg = fs.readFileSync(CARTRIDGE_PATH, 'utf8');
  const defaultSvg = fs.readFileSync(DEFAULT_PATH, 'utf8');

  const cartridgePixels = parseSvgPixels(cartridgeSvg);
  const defaultPixels = parseSvgPixels(defaultSvg);

  // Extract gem pixels from default.svg
  const defaultGemPixels = defaultPixels.filter(p => isGemColor(p.color));

  // Find bounds of default gem
  const defMinX = Math.min(...defaultGemPixels.map(p => p.x));
  const defMaxX = Math.max(...defaultGemPixels.map(p => p.x));
  const defMinY = Math.min(...defaultGemPixels.map(p => p.y));
  const defMaxY = Math.max(...defaultGemPixels.map(p => p.y));
  const defWidth = defMaxX - defMinX + 1;
  const defHeight = defMaxY - defMinY + 1;
  const defCenterX = (defMinX + defMaxX) / 2;
  const defCenterY = (defMinY + defMaxY) / 2;

  console.log(`Default gem: (${defMinX},${defMinY}) to (${defMaxX},${defMaxY}), size ${defWidth}x${defHeight}`);

  // Find gem pixels in cartridge (bright saturated colors in center area)
  const cartGemPixels = cartridgePixels.filter(p => {
    // Check if in likely gem area (center of cartridge, roughly 24-40 x, 24-44 y)
    if (p.x < 20 || p.x > 44 || p.y < 22 || p.y > 46) return false;
    return isGemColor(p.color);
  });

  if (cartGemPixels.length === 0) {
    console.log('No gem pixels found in cartridge!');
    return;
  }

  // Find bounds of cartridge gem
  const cartMinX = Math.min(...cartGemPixels.map(p => p.x));
  const cartMaxX = Math.max(...cartGemPixels.map(p => p.x));
  const cartMinY = Math.min(...cartGemPixels.map(p => p.y));
  const cartMaxY = Math.max(...cartGemPixels.map(p => p.y));
  const cartWidth = cartMaxX - cartMinX + 1;
  const cartHeight = cartMaxY - cartMinY + 1;
  const cartCenterX = (cartMinX + cartMaxX) / 2;
  const cartCenterY = (cartMinY + cartMaxY) / 2;

  console.log(`Cartridge gem: (${cartMinX},${cartMinY}) to (${cartMaxX},${cartMaxY}), size ${cartWidth}x${cartHeight}`);
  console.log(`Found ${cartGemPixels.length} gem pixels to update`);

  // Create a lookup for default gem colors by normalized position
  const defaultColorMap = new Map();
  for (const p of defaultGemPixels) {
    // Normalize position to 0-1 range
    const normX = (p.x - defMinX) / defWidth;
    const normY = (p.y - defMinY) / defHeight;
    const key = `${normX.toFixed(2)},${normY.toFixed(2)}`;
    defaultColorMap.set(key, p.color);
  }

  // Build replacement map
  let newSvg = cartridgeSvg;
  let replacements = 0;

  for (const cartPixel of cartGemPixels) {
    // Map cartridge pixel position to default gem position
    const normX = (cartPixel.x - cartMinX) / cartWidth;
    const normY = (cartPixel.y - cartMinY) / cartHeight;

    // Find corresponding position in default gem
    const defX = Math.round(defMinX + normX * defWidth);
    const defY = Math.round(defMinY + normY * defHeight);

    // Find closest default gem pixel
    let closestColor = null;
    let closestDist = Infinity;

    for (const defPixel of defaultGemPixels) {
      const dist = Math.abs(defPixel.x - defX) + Math.abs(defPixel.y - defY);
      if (dist < closestDist) {
        closestDist = dist;
        closestColor = defPixel.color;
      }
    }

    if (closestColor && closestDist < 5) {
      const newRect = `<rect x="${cartPixel.x}" y="${cartPixel.y}" width="1" height="1" fill="${closestColor}"`;
      const oldRect = `<rect x="${cartPixel.x}" y="${cartPixel.y}" width="1" height="1" fill="${cartPixel.color}"`;
      newSvg = newSvg.replace(oldRect, newRect);
      replacements++;
    }
  }

  console.log(`Replaced ${replacements} pixel colors`);

  fs.writeFileSync(CARTRIDGE_PATH, newSvg);
  console.log('Done!');
}

main();
