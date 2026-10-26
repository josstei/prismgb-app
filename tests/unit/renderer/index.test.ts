import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeferred } from '../../support/deferred.testkit';

const mocks = vi.hoisted(() => ({
  makeRuntime: vi.fn(),
  renderShell: vi.fn(),
  renderFatalError: vi.fn(),
  ready: vi.fn(),
  acknowledge: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn()
}));
vi.mock('@renderer/application/container.js', () => ({ createRendererRuntime: mocks.makeRuntime }));
vi.mock('@renderer/presentation/shell/app-shell.renderer.js', () => ({ renderAppShell: mocks.renderShell }));
vi.mock('@renderer/presentation/shell/fatal-error-screen', () => ({ renderFatalError: mocks.renderFatalError }));
vi.mock('@renderer/infrastructure/ipc/trpc-client', () => ({ trpcClient: { app: {
  rendererReady: { mutate: mocks.ready },
  rendererShutdownComplete: { mutate: mocks.acknowledge },
  onShutdown: { subscribe: mocks.subscribe }
} } }));

describe('renderer entry ownership', () => {
  let runtime: { start: ReturnType<typeof vi.fn<() => Promise<void>>>; dispose: ReturnType<typeof vi.fn<() => Promise<void>>> };
  let windowListeners: Map<string, EventListenerOrEventListenerObject>;
  let documentListeners: Map<string, EventListenerOrEventListenerObject>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    runtime = { start: vi.fn(async () => {}), dispose: vi.fn(async () => {}) };
    mocks.makeRuntime.mockReturnValue(runtime);
    mocks.subscribe.mockReturnValue({ unsubscribe: mocks.unsubscribe });
    mocks.ready.mockResolvedValue(undefined);
    mocks.acknowledge.mockResolvedValue(undefined);
    document.body.innerHTML = '<div id="appContainer"></div>';
    document.body.className = '';
    delete document.body.dataset.prismgbAppStarted;
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
    windowListeners = new Map();
    documentListeners = new Map();
    vi.spyOn(window, 'addEventListener').mockImplementation((type, listener) => { windowListeners.set(type, listener); });
    vi.spyOn(document, 'addEventListener').mockImplementation((type, listener) => { documentListeners.set(type, listener); });
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  function unload(): Promise<void> {
    const listener = windowListeners.get('beforeunload') as () => Promise<void>;
    return listener();
  }
  function requestShutdown(requestId = 'shutdown'): void {
    mocks.subscribe.mock.calls[0][1].onData({ requestId });
  }

  it('renders before constructing the runtime and reports readiness only after startup completes', async () => {
    const startup = createDeferred();
    runtime.start.mockReturnValue(startup.promise);
    await import('@renderer/index');
    expect(mocks.renderShell.mock.invocationCallOrder[0]).toBeLessThan(mocks.makeRuntime.mock.invocationCallOrder[0]);
    expect(runtime.start).toHaveBeenCalledOnce();
    expect(mocks.ready).not.toHaveBeenCalled();
    expect(document.body.dataset.prismgbAppStarted).toBeUndefined();
    startup.resolve();
    await vi.waitFor(() => expect(mocks.ready).toHaveBeenCalledOnce());
    expect(document.body.dataset.prismgbAppStarted).toBe('true');
    await unload();
    expect(runtime.dispose).toHaveBeenCalledOnce();
    expect(document.body.dataset.prismgbAppStarted).toBeUndefined();
  });

  it('joins early shutdown and unload until pending startup and disposal finish, without announcing readiness', async () => {
    const startup = createDeferred();
    const disposal = createDeferred();
    runtime.start.mockReturnValue(startup.promise);
    runtime.dispose.mockImplementation(async () => { await startup.promise; await disposal.promise; });
    await import('@renderer/index');
    requestShutdown();
    const unloaded = unload();
    expect(runtime.dispose).toHaveBeenCalledOnce();
    expect(mocks.acknowledge).not.toHaveBeenCalled();
    startup.resolve();
    await Promise.resolve();
    expect(mocks.ready).not.toHaveBeenCalled();
    expect(mocks.acknowledge).not.toHaveBeenCalled();
    disposal.resolve();
    await unloaded;
    await vi.waitFor(() => expect(mocks.acknowledge).toHaveBeenCalledWith({ requestId: 'shutdown', error: undefined }));
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    expect(mocks.ready).not.toHaveBeenCalled();
    expect(document.body.dataset.prismgbAppStarted).toBeUndefined();
  });

  it('does not start later when shutdown arrives before DOM readiness', async () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    await import('@renderer/index');
    requestShutdown();
    await vi.waitFor(() => expect(mocks.acknowledge).toHaveBeenCalledOnce());
    (documentListeners.get('DOMContentLoaded') as () => void)();
    await Promise.resolve();
    expect(mocks.makeRuntime).not.toHaveBeenCalled();
    expect(runtime.start).not.toHaveBeenCalled();
    expect(mocks.ready).not.toHaveBeenCalled();
  });

  it('finishes startup rollback before showing its original failure', async () => {
    const failure = new Error('startup failed');
    const disposal = createDeferred();
    runtime.start.mockRejectedValue(failure);
    runtime.dispose.mockReturnValue(disposal.promise);
    await import('@renderer/index');
    await vi.waitFor(() => expect(runtime.dispose).toHaveBeenCalledOnce());
    expect(mocks.renderFatalError).not.toHaveBeenCalled();
    disposal.reject(new Error('rollback also failed'));
    await vi.waitFor(() => expect(mocks.renderFatalError).toHaveBeenCalledWith(failure));
    expect(mocks.ready).not.toHaveBeenCalled();
  });

  it('reports failed disposal in the shutdown acknowledgement and releases the subscription', async () => {
    runtime.dispose.mockRejectedValue(new Error('notes flush failed'));
    await import('@renderer/index');
    await vi.waitFor(() => expect(mocks.ready).toHaveBeenCalledOnce());
    requestShutdown();
    await vi.waitFor(() => expect(mocks.acknowledge).toHaveBeenCalledWith({ requestId: 'shutdown', error: 'notes flush failed' }));
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    expect(document.body.dataset.prismgbAppStarted).toBeUndefined();
  });
});
