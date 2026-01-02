/**
 * Renderer Entry Point
 *
 * Simplified entry point using RendererAppOrchestrator bootstrap
 * All DI configuration, service instantiation, and event wiring
 * is handled by RendererAppOrchestrator
 */

import './assets/styles/styles.css';
import { CSSClasses } from '@shared/config/css-classes.config.js';
import { renderAppTemplates } from './ui/templates/index.js';

// Render templates into app container
const appContainer = document.getElementById('appContainer');
if (appContainer) {
  renderAppTemplates(appContainer);
}

// Mark body ready after CSS and templates are loaded (prevents FOUC)
document.body.classList.add(CSSClasses.BODY_READY);

// Import application bootstrap
import { createApplication } from './renderer-app.orchestrator.js';

// Global application instance
let app = null;

/**
 * Initialize the application
 */
async function init() {
  try {
    // Create and start application
    app = await createApplication();

  } catch (error) {
    // Use console.error as fallback since app may not be initialized
    // and logger is not available at this point in the lifecycle
    console.error('Failed to initialize application:', error);

    // Show error to user using safe DOM manipulation (prevents XSS)
    const container = document.createElement('div');
    container.style.cssText = 'padding: 20px; color: red; font-family: sans-serif;';

    const heading = document.createElement('h2');
    heading.textContent = 'Failed to initialize application';

    const message = document.createElement('p');
    message.textContent = error.message;

    const stack = document.createElement('pre');
    stack.textContent = error.stack;

    container.appendChild(heading);
    container.appendChild(message);
    container.appendChild(stack);

    document.body.innerHTML = '';
    document.body.appendChild(container);
  }
}

/**
 * Cleanup on window unload
 */
async function cleanup() {
  if (app) {
    await app.cleanup();
  }

  // Cleanup IPC listeners for all APIs
  if (window.deviceAPI?.removeDeviceListeners) {
    window.deviceAPI.removeDeviceListeners();
  }
  if (window.windowAPI?.removeListeners) {
    window.windowAPI.removeListeners();
  }
  if (window.updateAPI?.removeListeners) {
    window.updateAPI.removeListeners();
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Cleanup on window unload
window.addEventListener('beforeunload', cleanup);

// Expose app for debugging in development only
if (import.meta.env.DEV) {
  window.__app = () => app;
}
