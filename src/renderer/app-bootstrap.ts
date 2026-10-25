import { createRendererRuntime, type RendererRuntime } from './application/container.js';
import { renderAppShell } from './presentation/shell/app-shell.renderer.js';

/** The bootstrap owns one runtime; a disposed bootstrap creates a fresh graph on restart. */
export class RendererBootstrap {
  private runtime: RendererRuntime | null = null;
  isInitialized = false;

  async initialize(): Promise<void> {
    if (!this.runtime) {
      const appContainer = document.getElementById('appContainer');
      if (appContainer) renderAppShell(appContainer);
      this.runtime = createRendererRuntime();
    }
    await this.runtime.initialize();
    this.isInitialized = true;
  }

  async start(): Promise<void> {
    if (!this.isInitialized || !this.runtime) {
      throw new Error('Renderer application not initialized. Call initialize() first.');
    }
    await this.runtime.start();
    document.body.dataset.prismgbAppStarted = 'true';
    console.info('[RendererBootstrap] Renderer application started successfully');
  }

  async cleanup(): Promise<void> {
    const runtime = this.runtime;
    try {
      await runtime?.dispose();
    } finally {
      if (this.runtime === runtime) this.runtime = null;
      this.isInitialized = false;
      delete document.body.dataset.prismgbAppStarted;
    }
  }
}

export async function createApplication(): Promise<RendererBootstrap> {
  const app = new RendererBootstrap();
  try {
    await app.initialize();
    await app.start();
    return app;
  } catch (error) {
    try { await app.cleanup(); } catch { /* Keep the startup error. */ }
    throw error;
  }
}
