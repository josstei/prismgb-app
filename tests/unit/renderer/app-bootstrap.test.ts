/**
 * Renderer Bootstrap Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('@renderer/application/container.ts', async () => {
  const { createRendererAppContainerMock } = await import('../../factories/index.js');

  return {
    initializeContainer: vi.fn(() => createRendererAppContainerMock())
  };
});

vi.mock('@renderer/presentation/shell/app-shell.renderer.js', () => ({
  renderAppShell: vi.fn()
}));

const { RendererBootstrap } = await import('@renderer/app-bootstrap');
const { TOKENS } = await import('@renderer/application/di/tokens');

describe('RendererBootstrap', () => {
  let app;

  beforeEach(() => {

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    delete document.body.dataset.prismgbAppStarted;

    app = new RendererBootstrap();
  });

  describe('Constructor', () => {
    it('should initialize with null container', () => {
      expect(app.container).toBeNull();
    });

    it('should initialize with null orchestrator', () => {
      expect(app.orchestrator).toBeNull();
    });

    it('should initialize with isInitialized false', () => {
      expect(app.isInitialized).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should initialize container', async () => {
      await app.initialize();

      expect(app.container).toBeDefined();
    });

    it('should resolve the body-class effect, core components, event bridge and transcode service in order', async () => {
      await app.initialize();

      const { container } = app;
      const resolved = container.get.mock.calls.map(([token]) => token.description);
      expect(resolved.slice(0, 4)).toEqual(['bodyClassEffect', 'uiComponentHost', 'uiEventBridge', 'transcodeService']);

      const host = container.get(TOKENS.uiComponentHost);
      const bridge = container.get(TOKENS.uiEventBridge);
      const transcodeService = container.get(TOKENS.transcodeService);
      const orchestrator = container.get(TOKENS.appOrchestrator);
      const order = [host.resolveCore, bridge.initialize, transcodeService.initialize, orchestrator.initialize]
        .map((fn) => fn.mock.invocationCallOrder[0]);
      expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it('should resolve orchestrator', async () => {
      await app.initialize();

      expect(app.orchestrator).toBeDefined();
    });

    it('should set isInitialized to true', async () => {
      await app.initialize();

      expect(app.isInitialized).toBe(true);
    });

    it('should warn if already initialized', async () => {
      await app.initialize();
      await app.initialize();

      expect(console.warn).toHaveBeenCalledWith('[RendererBootstrap]', 'Renderer application already initialized');
    });
  });

  describe('start', () => {
    it('should throw if not initialized', async () => {
      await expect(app.start()).rejects.toThrow('Renderer application not initialized');
    });

    it('should start orchestrator', async () => {
      await app.initialize();
      await app.start();

      expect(app.orchestrator.start).toHaveBeenCalled();
    });

    it('should expose app-started lifecycle state after orchestrator start', async () => {
      await app.initialize();
      await app.start();

      expect(document.body.dataset.prismgbAppStarted).toBe('true');
    });
  });

  describe('cleanup', () => {
    it('should cleanup orchestrator', async () => {
      await app.initialize();
      const orchestrator = app.orchestrator;
      await app.cleanup();

      expect(orchestrator.cleanup).toHaveBeenCalled();
    });

    it('should dispose the event bridge, then the effects, then the component host after the orchestrator', async () => {
      await app.initialize();
      const { container } = app;
      const disposers = [
        container.get(TOKENS.appOrchestrator).cleanup,
        container.get(TOKENS.uiEventBridge).dispose,
        container.get(TOKENS.autoHideEffect).dispose,
        container.get(TOKENS.feedbackEffect).dispose,
        container.get(TOKENS.bodyClassEffect).dispose,
        container.get(TOKENS.uiComponentHost).dispose
      ];

      await app.cleanup();

      const order = disposers.map((fn) => fn.mock.invocationCallOrder[0]);
      expect(order.every((call) => call !== undefined)).toBe(true);
      expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it('should keep disposing when one UI disposer throws', async () => {
      await app.initialize();
      const { container } = app;
      container.get(TOKENS.autoHideEffect).dispose.mockImplementation(() => {
        throw new Error('boom');
      });

      await app.cleanup();

      expect(container.get(TOKENS.uiComponentHost).dispose).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith('[RendererBootstrap]', 'Error disposing autoHideEffect:', 'boom');
    });

    it('should set isInitialized to false', async () => {
      await app.initialize();
      await app.cleanup();

      expect(app.isInitialized).toBe(false);
    });

    it('should clear app-started lifecycle state on cleanup', async () => {
      await app.initialize();
      await app.start();
      await app.cleanup();

      expect(document.body.dataset.prismgbAppStarted).toBeUndefined();
    });

    it('should handle cleanup without initialization', async () => {
      await expect(app.cleanup()).resolves.not.toThrow();
    });
  });
});
