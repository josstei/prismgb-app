/**
 * Renders a last-resort fatal error screen when application bootstrap fails,
 * before the logger/DI are available. Uses safe DOM construction (no innerHTML
 * for untrusted content) to avoid XSS.
 */
export function renderFatalError(error: Error): void {
  const container = document.createElement('div');
  container.style.cssText = 'padding: 20px; color: red; font-family: sans-serif;';

  const heading = document.createElement('h2');
  heading.textContent = 'Failed to initialize application';

  const message = document.createElement('p');
  message.textContent = error.message;

  const stack = document.createElement('pre');
  stack.textContent = error.stack ?? '';

  container.appendChild(heading);
  container.appendChild(message);
  container.appendChild(stack);

  document.body.innerHTML = '';
  document.body.appendChild(container);
}
