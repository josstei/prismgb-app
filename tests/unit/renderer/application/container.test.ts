import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('@renderer/infrastructure/ipc/trpc-client', async () => ({
  trpcClient: (await import('../../../support/mocks/trpc-client.mock.js')).createTrpcClientMock()
}));
import { renderAppShell } from '@renderer/presentation/shell/app-shell.renderer.js';
import { createRendererRuntime, type RendererRuntime } from '@renderer/application/container.js';
import { createLoggerFactory, createStorageService } from '../../../factories/index.js';
import { NotesPanelComponent } from '@renderer/presentation/features/notes/notes-panel.component.js';
import { UIEventBridge } from '@renderer/presentation/bridges/ui-event.bridge.js';

function runtime() {
  const unsubscribe = vi.fn();
  const disconnected = { state: 'disconnected' as const, connected: false, device: null };
  return { unsubscribe, runtime: createRendererRuntime({
    loggerFactory: createLoggerFactory(), storageService: createStorageService(),
    deviceStatusPort: {
      getStatus: vi.fn().mockResolvedValue(disconnected), refreshStatus: vi.fn().mockResolvedValue(disconnected),
      subscribe: vi.fn(() => unsubscribe)
    },
    mediaDevicesPort: { enumerateDevices: vi.fn().mockResolvedValue([]), getUserMedia: vi.fn(), subscribeDeviceChange: vi.fn(() => unsubscribe) },
    devicePreferenceStore: { readStoredDeviceIds: () => [], storeDeviceId: vi.fn() }
  }) };
}

describe('Renderer runtime ownership', () => {
  const live: RendererRuntime[] = [];
  beforeEach(() => { document.body.innerHTML = '<div id="appContainer"></div>'; renderAppShell(document.getElementById('appContainer')!);  });
  afterEach(async () => { await Promise.all(live.splice(0).map(value => value.dispose())); });

  it('preserves core/deferred startup, releases subscriptions, and creates a fresh graph', async () => {
    const first = runtime(); live.push(first.runtime);
    const resolve = vi.spyOn(first.runtime.uiComponentHost, 'get');
    expect(resolve).not.toHaveBeenCalled();
    await Promise.all([first.runtime.initialize(), first.runtime.initialize()]);
    expect(resolve.mock.calls.map(([id]) => id)).toEqual(['statusNotificationComponent', 'deviceStatusComponent', 'streamControlsComponent', 'transcodeToastComponent']);
    await first.runtime.start();
    expect(resolve.mock.calls.map(([id]) => id)).toEqual(expect.arrayContaining(['settingsMenuComponent', 'shaderSelectorComponent', 'notesPanelComponent']));
    await Promise.all([first.runtime.dispose(), first.runtime.dispose()]);
    expect(first.unsubscribe).toHaveBeenCalledTimes(2);
    expect(first.runtime.eventBus.emitter.eventNames()).toEqual([]);
    const next = runtime(); live.push(next.runtime);
    expect(next.runtime.eventBus).not.toBe(first.runtime.eventBus);
    await next.runtime.initialize();
    await next.runtime.dispose();
    expect(next.runtime.eventBus.emitter.eventNames()).toEqual([]);
  });

  it('rolls back subscriptions when initialization fails after core components are created', async () => {
    const failure = new Error('bridge initialization failed');
    vi.spyOn(UIEventBridge.prototype, 'initialize').mockImplementationOnce(() => { throw failure; });
    const value = runtime().runtime; live.push(value);
    await expect(value.initialize()).rejects.toBe(failure);
    expect(() => value.uiComponentHost.get('deviceStatusComponent')).toThrow('UI component host has been disposed');
    expect(value.eventBus.emitter.eventNames()).toEqual([]);
    await value.dispose();
  });
  it('rolls back a deferred component that fails after mounting subscriptions', async () => {
    const initialize = NotesPanelComponent.prototype.initialize;
    vi.spyOn(NotesPanelComponent.prototype, 'initialize').mockImplementationOnce(function (...args) {
      initialize.apply(this, args);
      throw new Error('notes mount failed');
    });
    const value = runtime().runtime; live.push(value);
    await value.initialize();
    await expect(value.start()).rejects.toThrow('notes mount failed');
    expect(() => value.uiComponentHost.get('notesPanelComponent')).toThrow('UI component host has been disposed');
    expect(value.eventBus.emitter.eventNames()).toEqual([]);
    await value.dispose();
  });

});
