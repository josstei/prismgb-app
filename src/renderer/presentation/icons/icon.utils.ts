/**
 * Icon Utility
 *
 * Creates SVG icon elements from Vite-discovered raw SVG strings.
 */

const ICON_MODULES = import.meta.glob('../../assets/icons/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

function getIconNameFromPath(modulePath: string): string {
  return modulePath.split('/').pop()?.replace(/\.svg$/, '') ?? '';
}

const icons = Object.fromEntries(
  Object.entries(ICON_MODULES).map(([modulePath, svgString]) => [
    getIconNameFromPath(modulePath),
    svgString
  ])
);

export function getIconSvg(name: string, size?: number): string {
  const svgString = icons[name];
  if (!svgString) {
    console.warn(`Icon "${name}" not found in registry`);
    return '';
  }

  if (!size) {
    return svgString;
  }

  return svgString
    .replace(/width="[^"]*"/, `width="${size}"`)
    .replace(/height="[^"]*"/, `height="${size}"`);
}
