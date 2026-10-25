import { describe, it, expect, vi, beforeEach } from 'vitest';
const { makeRuntime, renderShell } = vi.hoisted(() => ({
  makeRuntime: vi.fn(() => ({ initialize: vi.fn().mockResolvedValue(undefined), start: vi.fn().mockResolvedValue(undefined), dispose: vi.fn().mockResolvedValue(undefined) })),
  renderShell: vi.fn()
}));
vi.mock('@renderer/application/container.js', () => ({ createRendererRuntime: makeRuntime }));
vi.mock('@renderer/presentation/shell/app-shell.renderer.js', () => ({ renderAppShell: renderShell }));
import { RendererBootstrap } from '@renderer/app-bootstrap.js';

describe('RendererBootstrap', () => {
  beforeEach(() => { makeRuntime.mockClear(); document.body.innerHTML = '<div id="appContainer"></div>'; delete document.body.dataset.prismgbAppStarted; });
  it('renders the shell before constructing a runtime and exposes readiness only after start', async () => {
    const app = new RendererBootstrap();
    await app.initialize();
    expect(renderShell).toHaveBeenCalled();
    expect(document.body.dataset.prismgbAppStarted).toBeUndefined();
    await app.start();
    expect(document.body.dataset.prismgbAppStarted).toBe('true');
    expect(makeRuntime).toHaveBeenCalledOnce();
    await app.cleanup();
    expect(makeRuntime.mock.results[0]!.value.dispose).toHaveBeenCalledOnce();
    expect(document.body.dataset.prismgbAppStarted).toBeUndefined();
    expect(app.isInitialized).toBe(false);
  });
  it('creates a fresh runtime after disposal', async () => {
    const app = new RendererBootstrap();
    await app.initialize();
    await app.cleanup();
    await app.initialize();
    expect(makeRuntime).toHaveBeenCalledTimes(2);
    await app.cleanup();
  });
  it('requires initialization before start', async () => {
    await expect(new RendererBootstrap().start()).rejects.toThrow('not initialized');
  });
});
