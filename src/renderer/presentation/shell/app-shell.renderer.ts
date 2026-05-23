import { createAppShellTemplate } from './app-shell.template.js';

export function renderAppShell(container: HTMLElement | null): void {
  if (!container) return;
  container.innerHTML = createAppShellTemplate();
}
