/**
 * App Shell Renderer
 *
 * Renders the application shell into the container.
 */

import { createAppShellTemplate } from './app-shell.template.js';

export function renderAppShell(container) {
  if (!container) return;
  container.innerHTML = createAppShellTemplate();
}
