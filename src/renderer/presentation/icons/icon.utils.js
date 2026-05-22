/**
 * Icon Utility
 *
 * Creates SVG icon elements from Vite-discovered raw SVG strings.
 */

const ICON_MODULES = import.meta.glob('../../assets/icons/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true
});

function getIconNameFromPath(modulePath) {
  return modulePath.split('/').pop().replace(/\.svg$/, '');
}

const icons = Object.fromEntries(
  Object.entries(ICON_MODULES).map(([modulePath, svgString]) => [
    getIconNameFromPath(modulePath),
    svgString
  ])
);

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
