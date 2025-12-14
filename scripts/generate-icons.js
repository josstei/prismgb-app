#!/usr/bin/env node

/**
 * Icon Generation Script
 *
 * Generates platform-specific app icons from source SVG files:
 * - icon.png (512x512) - Linux app icon
 * - icon.ico (multi-resolution) - Windows app icon
 * - icon.icns (multi-resolution) - macOS app icon with rounded rect background
 * - tray-icon.png (64x64) - system tray icon
 */

import sharp from 'sharp';
import png2icons from 'png2icons';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets');
const OVERLAY_DIR = join(ASSETS_DIR, 'overlay-icons');

// Source file
const APP_ICON_SOURCE = join(OVERLAY_DIR, 'default.svg');

// Output files
const OUTPUTS = {
  iconPng: join(ASSETS_DIR, 'icon.png'),
  iconIco: join(ASSETS_DIR, 'icon.ico'),
  iconIcns: join(ASSETS_DIR, 'icon.icns'),
  trayPng: join(ASSETS_DIR, 'tray-icon.png')
};
const TRAY_ICON_SIZE = 30; // Slightly smaller again for macOS menu bar clearance

// macOS icon background colors (matches app body gradient)
// body { background: linear-gradient(135deg, --color-bg-primary 0%, --color-bg-secondary 50%, --color-bg-tertiary 100%); }
const ICON_BG_PRIMARY = '#0f0f1e';
const ICON_BG_SECONDARY = '#1a1a2e';
const ICON_BG_TERTIARY = '#16213e';
// Subtle border for depth - slight white tint
const ICON_BORDER_COLOR = 'rgba(255, 255, 255, 0.08)';

/**
 * Create a macOS-style rounded rectangle background SVG
 * Corner radius is ~22.37% of size (Apple's standard)
 * Includes inner highlight for polish
 */
function createRoundedRectBackground(size) {
  const radius = Math.round(size * 0.2237);
  const borderWidth = Math.round(size * 0.015); // 1.5% border width
  return Buffer.from(`
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${ICON_BG_PRIMARY};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${ICON_BG_SECONDARY};stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#bgGradient)"
            stroke="${ICON_BORDER_COLOR}" stroke-width="${borderWidth}"/>
    </svg>
  `);
}

// Dark purple for gem edges - blends with dark background
const GEM_EDGE_COLOR = '#2a2040';

async function svgToPng(svgPath, size, replaceEdgeColor = false) {
  let svgContent = await readFile(svgPath, 'utf8');

  // Optionally replace dark edge colors with purple
  if (replaceEdgeColor) {
    // Match dark colors in the #1b-#23 range (the gem's black outline pixels)
    svgContent = svgContent.replace(/fill="#(1[b-f]|2[0-3])[0-9a-f]{4}"/gi, `fill="${GEM_EDGE_COLOR}"`);
  }

  const svgBuffer = Buffer.from(svgContent);
  return sharp(svgBuffer, { density: 300 })
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

/**
 * Create icon with macOS-style rounded rect background
 */
async function createMacOSIcon(gemPng, size) {
  // Create rounded rectangle background
  const bgSvg = createRoundedRectBackground(size);
  const background = await sharp(bgSvg).png().toBuffer();

  // Scale gem to fit nicely within the background (with padding)
  const gemSize = Math.round(size * 0.85);
  const scaledGem = await sharp(gemPng)
    .resize(gemSize, gemSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  // Create drop shadow (dark, offset down)
  const shadow = await sharp(gemPng)
    .resize(gemSize, gemSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .blur(25)
    .modulate({ brightness: 0.1, saturation: 0 }) // Dark shadow
    .png()
    .toBuffer();

  // Create subtle glow (soft ambient light)
  const glow = await sharp(gemPng)
    .resize(gemSize, gemSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .blur(30)
    .modulate({ brightness: 1.2, saturation: 1.1 })
    .png()
    .toBuffer();

  // Composite gem onto background (centered horizontally, slightly lower vertically)
  const horizontalOffset = Math.round((size - gemSize) / 2);
  const verticalOffset = Math.round((size - gemSize) / 2) + Math.round(size * 0.02); // 2% lower
  const shadowOffset = Math.round(size * 0.025); // Shadow offset down

  return sharp(background)
    .composite([
      {
        input: shadow,
        top: verticalOffset + shadowOffset,
        left: horizontalOffset,
        blend: 'multiply',
      },
      {
        input: glow,
        top: verticalOffset,
        left: horizontalOffset,
        blend: 'soft-light',
      },
      {
        input: scaledGem,
        top: verticalOffset,
        left: horizontalOffset,
      }
    ])
    .png()
    .toBuffer();
}

async function generateAppIcons() {
  console.log('Generating app icons from default.svg...');

  // Generate gem at 1024x1024 with dark purple edges (blends with background)
  const gemPng = await svgToPng(APP_ICON_SOURCE, 1024, true);

  // Create macOS-style icon with rounded rect background (1024x1024)
  const macosIcon = await createMacOSIcon(gemPng, 1024);

  // Save 512x512 PNG for Linux/general use (with background)
  const linuxIcon = await sharp(macosIcon)
    .resize(512, 512)
    .png()
    .toBuffer();
  await writeFile(OUTPUTS.iconPng, linuxIcon);
  console.log(`  Created: ${OUTPUTS.iconPng}`);

  // Generate ICO (Windows) - includes multiple resolutions (with background)
  const icoBuffer = png2icons.createICO(macosIcon, png2icons.BICUBIC2, 0, true, true);
  if (icoBuffer) {
    await writeFile(OUTPUTS.iconIco, icoBuffer);
    console.log(`  Created: ${OUTPUTS.iconIco}`);
  } else {
    console.error('  Failed to create ICO file');
    process.exit(1);
  }

  // Generate ICNS (macOS) - includes multiple resolutions (with background)
  const icnsBuffer = png2icons.createICNS(macosIcon, png2icons.BICUBIC2, 0);
  if (icnsBuffer) {
    await writeFile(OUTPUTS.iconIcns, icnsBuffer);
    console.log(`  Created: ${OUTPUTS.iconIcns}`);
  } else {
    console.error('  Failed to create ICNS file');
    process.exit(1);
  }

  // Generate tray icon (PNG) - transparent gem with original black edges
  const trayGem = await svgToPng(APP_ICON_SOURCE, 1024, false);
  const trayIcon = await sharp(trayGem)
    .resize(TRAY_ICON_SIZE, TRAY_ICON_SIZE)
    .png()
    .toBuffer();
  await writeFile(OUTPUTS.trayPng, trayIcon);
  console.log(`  Created: ${OUTPUTS.trayPng}`);
}

async function main() {
  console.log('Icon Generation Script\n');
  console.log(`Source: ${APP_ICON_SOURCE}`);
  console.log('');

  if (!existsSync(APP_ICON_SOURCE)) {
    console.error(`Missing source file: ${APP_ICON_SOURCE}`);
    process.exit(1);
  }

  await generateAppIcons();

  console.log('\nIcon generation complete!');
}

main().catch((error) => {
  console.error('Error generating icons:', error);
  process.exit(1);
});
