/**
 * Icon Utility
 *
 * Creates SVG icon elements from imported raw SVG strings.
 * Uses Vite's ?raw suffix for tree-shaking support.
 */

// Header icons
import headerFullscreen from '@renderer/assets/icons/header-fullscreen.svg?raw';
import headerSettings from '@renderer/assets/icons/header-settings.svg?raw';

// Toolbar icons
import toolbarScreenshot from '@renderer/assets/icons/toolbar-screenshot.svg?raw';
import toolbarRecord from '@renderer/assets/icons/toolbar-record.svg?raw';
import toolbarRecordActive from '@renderer/assets/icons/toolbar-record-active.svg?raw';
import toolbarNotes from '@renderer/assets/icons/toolbar-notes.svg?raw';
import toolbarShader from '@renderer/assets/icons/toolbar-shader.svg?raw';

// Shader panel icons
import shaderBrightness from '@renderer/assets/icons/shader-brightness.svg?raw';
import shaderVolume from '@renderer/assets/icons/shader-volume.svg?raw';

// Settings menu icons
import settingsGithub from '@renderer/assets/icons/settings-github.svg?raw';
import settingsWebsite from '@renderer/assets/icons/settings-website.svg?raw';
import settingsDisclaimer from '@renderer/assets/icons/settings-disclaimer.svg?raw';

// Notes panel icons
import notesClose from '@renderer/assets/icons/notes-close.svg?raw';
import notesNew from '@renderer/assets/icons/notes-new.svg?raw';
import notesDelete from '@renderer/assets/icons/notes-delete.svg?raw';
import notesEmpty from '@renderer/assets/icons/notes-empty.svg?raw';

// Overlay icons
import overlayFullscreenExit from '@renderer/assets/icons/overlay-fullscreen-exit.svg?raw';

/**
 * Icon registry - maps icon names to raw SVG strings
 */
const icons = {
  // Header
  'header-fullscreen': headerFullscreen,
  'header-settings': headerSettings,

  // Toolbar
  'toolbar-screenshot': toolbarScreenshot,
  'toolbar-record': toolbarRecord,
  'toolbar-record-active': toolbarRecordActive,
  'toolbar-notes': toolbarNotes,
  'toolbar-shader': toolbarShader,

  // Shader panel
  'shader-brightness': shaderBrightness,
  'shader-volume': shaderVolume,

  // Settings menu
  'settings-github': settingsGithub,
  'settings-website': settingsWebsite,
  'settings-disclaimer': settingsDisclaimer,

  // Notes panel
  'notes-close': notesClose,
  'notes-new': notesNew,
  'notes-delete': notesDelete,
  'notes-empty': notesEmpty,

  // Overlay
  'overlay-fullscreen-exit': overlayFullscreenExit
};

/**
 * Create an SVG icon element
 * @param {string} name - Icon name from registry
 * @param {Object} [options] - Optional configuration
 * @param {number} [options.size] - Icon size (width and height), overrides SVG default
 * @param {string} [options.className] - Additional CSS class
 * @param {string} [options.ariaLabel] - Accessibility label (if provided, sets aria-hidden to false)
 * @returns {HTMLSpanElement} Wrapper span containing SVG
 */
export function createIcon(name, options = {}) {
  const { size, className = '', ariaLabel = '' } = options;

  const svgString = icons[name];
  if (!svgString) {
    console.warn(`Icon "${name}" not found in registry`);
    return document.createElement('span');
  }

  // Create wrapper span for consistent styling
  const wrapper = document.createElement('span');
  wrapper.className = `icon icon-${name}${className ? ` ${className}` : ''}`;
  wrapper.setAttribute('aria-hidden', ariaLabel ? 'false' : 'true');
  if (ariaLabel) {
    wrapper.setAttribute('aria-label', ariaLabel);
  }

  // Parse and insert SVG
  wrapper.innerHTML = svgString;

  // Apply size to SVG element if provided
  if (size) {
    const svg = wrapper.querySelector('svg');
    if (svg) {
      svg.setAttribute('width', String(size));
      svg.setAttribute('height', String(size));
    }
  }

  return wrapper;
}

/**
 * Get raw SVG string for inline use in templates
 * @param {string} name - Icon name from registry
 * @param {number} [size] - Optional size to apply
 * @returns {string} Raw SVG string with size applied if specified
 */
export function getIconSvg(name, size) {
  const svgString = icons[name];
  if (!svgString) {
    console.warn(`Icon "${name}" not found in registry`);
    return '';
  }

  // If no size override, return as-is
  if (!size) {
    return svgString;
  }

  // Replace width/height attributes with provided size
  return svgString
    .replace(/width="[^"]*"/, `width="${size}"`)
    .replace(/height="[^"]*"/, `height="${size}"`);
}

/**
 * Check if an icon exists in the registry
 * @param {string} name - Icon name
 * @returns {boolean} True if icon exists
 */
export function hasIcon(name) {
  return name in icons;
}

/**
 * Get all available icon names
 * @returns {string[]} Array of icon names
 */
export function getIconNames() {
  return Object.keys(icons);
}
