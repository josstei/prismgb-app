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
import notesNew from '@renderer/assets/icons/notes-new.svg?raw';
import notesDelete from '@renderer/assets/icons/notes-delete.svg?raw';
import notesEmpty from '@renderer/assets/icons/notes-empty.svg?raw';
import search from '@renderer/assets/icons/search.svg?raw';
import filter from '@renderer/assets/icons/filter.svg?raw';
import tagAdd from '@renderer/assets/icons/tag-add.svg?raw';

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
  'notes-new': notesNew,
  'notes-delete': notesDelete,
  'notes-empty': notesEmpty,
  'search': search,
  'filter': filter,
  'tag-add': tagAdd,

  // Overlay
  'overlay-fullscreen-exit': overlayFullscreenExit
};

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
