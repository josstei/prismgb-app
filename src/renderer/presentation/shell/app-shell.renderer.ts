import { createAppShellTemplate } from './app-shell.template';

export function renderAppShell(container: HTMLElement | null): void {
  if (!container) return;
  container.innerHTML = createAppShellTemplate();
}
