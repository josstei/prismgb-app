/**
 * Renderer Entry Point
 *
 * Simplified entry point using RendererBootstrap
 * All DI configuration, service instantiation, and event wiring
 * is handled by RendererBootstrap
 */

import './presentation/styles/styles.css';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
// Global error handlers for uncaught errors
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error);
});

// Import application bootstrap
import { createApplication } from './app-bootstrap';
import type { RendererBootstrap } from './app-bootstrap';
import { renderFatalError } from './presentation/shell/fatal-error-screen';

// Global application instance
let app: RendererBootstrap | null = null;

/**
 * Initialize the application
 */
async function init() {
  try {
    // Create and start application
    app = await createApplication();

    // Mark body ready after CSS and templates are loaded (prevents FOUC)
    document.body.classList.add(CSSClasses.BODY_READY);
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error));

    // Use console.error as fallback since app may not be initialized
    // and logger is not available at this point in the lifecycle
    console.error('Failed to initialize application:', normalizedError);

    // Show fatal error screen
    renderFatalError(normalizedError);
  }
}

/**
 * Cleanup on window unload
 */
async function cleanup() {
  if (app) {
    await app.cleanup();
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

// Cleanup on window unload (once: true since it only fires once per page)
window.addEventListener('beforeunload', cleanup, { once: true });

// Expose app for debugging in development only
if (import.meta.env.DEV) {
  window.__app = () => app;
}

// Dev-only: Handle Vite connection loss/recovery during sleep/wake
if (import.meta.hot) {
  let connectionLost = false;

  // Detect when Vite connection is lost
  import.meta.hot.on('vite:ws:disconnect', () => {
    connectionLost = true;
    console.debug('[vite] Connection lost, will reload on reconnect');
  });

  // When Vite reconnects after connection loss, do a controlled reload
  import.meta.hot.on('vite:ws:connect', () => {
    if (connectionLost) {
      console.debug('[vite] Connection restored, reloading in 500ms...');
      setTimeout(() => window.location.reload(), 500);
    }
  });
}
