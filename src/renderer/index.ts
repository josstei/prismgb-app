/**
 * Renderer Entry Point
 *
 * Starts one renderer runtime and acknowledges process shutdown after disposal.
 */

import './presentation/styles/styles.css';
import { trpcClient } from './infrastructure/ipc/trpc-client';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { createRendererRuntime, type RendererRuntime } from './application/container.js';
import { renderAppShell } from './presentation/shell/app-shell.renderer.js';
// Global error handlers for uncaught errors
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error);
});

import { renderFatalError } from './presentation/shell/fatal-error-screen';

let app: RendererRuntime | null = null;
let cleanupPromise: Promise<void> | null = null;
let closing = false;

// Register before reporting readiness so main can keep IPC and transcoding alive
// until notes are flushed and recording/rendering resources finish draining.
const shutdownSubscription = trpcClient.app.onShutdown.subscribe(undefined, {
  onData: ({ requestId }) => {
    void completeShutdown(requestId).catch((error: unknown) => {
      console.error('Failed to acknowledge renderer shutdown:', error);
    });
  },
  onError: (error) => console.error('Application shutdown subscription failed:', error)
});

async function completeShutdown(requestId: string): Promise<void> {
  let failure: string | undefined;
  try {
    await cleanup();
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    console.error('Renderer cleanup failed:', error);
  }
  try {
    await trpcClient.app.rendererShutdownComplete.mutate({ requestId, error: failure });
  } finally {
    shutdownSubscription.unsubscribe();
  }
}

/**
 * Initialize the application
 */
async function init() {
  if (closing) return;
  try {
    const appContainer = document.getElementById('appContainer');
    if (appContainer) renderAppShell(appContainer);
    // Establish ownership before startup yields so an early shutdown joins disposal.
    app = createRendererRuntime();
    await app.start();
    if (closing) return;

    // Mark body ready after CSS and templates are loaded (prevents FOUC)
    document.body.dataset.prismgbAppStarted = 'true';
    document.body.classList.add(CSSClasses.BODY_READY);
    console.info('[RendererEntry] Renderer application started successfully');
    void trpcClient.app.rendererReady.mutate().catch((error: unknown) => {
      console.error('Failed to report renderer readiness:', error);
    });
  } catch (error) {
    const current = app;
    try { await current?.dispose(); } catch { /* Preserve the startup failure. */ }
    if (app === current) app = null;
    if (closing) return;
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
function cleanup(): Promise<void> {
  closing = true;
  return cleanupPromise ??= (async () => {
    const current = app;
    try {
      await current?.dispose();
    } finally {
      if (app === current) app = null;
      delete document.body.dataset.prismgbAppStarted;
    }
  })();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

// Cleanup on window unload (once: true since it only fires once per page)
window.addEventListener('beforeunload', cleanup, { once: true });

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
