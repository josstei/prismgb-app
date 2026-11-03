import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { SettingsDisplayModeOrchestrator } from '@renderer/application/orchestrators/display-mode.orchestrator';
import { AppState } from '@renderer/application/state/app-state';
import { EventChannels, PlatformEventBus } from '@platform/events';
import { createLoggerFactory } from '../../../../factories/logger.factory.js';
import { createSettingsServiceMock } from '../../../../factories/settings.factory.js';
import { installDocumentPropertyMock } from '../../../../support/mocks/browser-api.installers.js';

describe('SettingsDisplayModeOrchestrator', () => {
  let orchestrator: SettingsDisplayModeOrchestrator;
  let appState: AppState;
  let eventBus: PlatformEventBus;
  let fullscreen: { initialize: Mock<() => void>; enterFullscreen: Mock<() => void>; dispose: Mock<() => void> };
  let settings: ReturnType<typeof createSettingsServiceMock>;
  let hidden: ReturnType<typeof installDocumentPropertyMock>;

  beforeEach(async () => {
    hidden = installDocumentPropertyMock('hidden', false);
    appState = new AppState({
      streamingService: { isStreaming: false, currentCapabilities: null, getStream: () => null },
      rendererDeviceRuntime: { isConnected: false }
    });
    eventBus = new PlatformEventBus();
    fullscreen = { initialize: vi.fn<() => void>(), enterFullscreen: vi.fn<() => void>(), dispose: vi.fn<() => void>() };
    settings = createSettingsServiceMock({ values: { fullscreenOnStartup: false } });
    orchestrator = new SettingsDisplayModeOrchestrator({
      appState, eventBus, fullscreenService: fullscreen, settingsService: settings, loggerFactory: createLoggerFactory()
    });
    await orchestrator.initialize();
  });

  afterEach(async () => {
    await orchestrator.dispose();
    hidden.cleanup();
  });

  it('toggles cinematic state before publishing its setting event and unsubscribes on disposal', async () => {
    const observed: boolean[] = [];
    const unsubscribe = eventBus.subscribe<{ enabled: boolean }>(EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED, ({ enabled }) => {
      expect(appState.isCinematicModeEnabled).toBe(enabled);
      observed.push(enabled);
    });
    try {
      eventBus.publish(EventChannels.UI.CINEMATIC_TOGGLE_REQUESTED);
      eventBus.publish(EventChannels.UI.CINEMATIC_TOGGLE_REQUESTED);
      expect(observed).toEqual([false, true]);
      await orchestrator.dispose();
      eventBus.publish(EventChannels.UI.CINEMATIC_TOGGLE_REQUESTED);
      expect(observed).toEqual([false, true]);
      expect(fullscreen.dispose).toHaveBeenCalledOnce();
    } finally {
      unsubscribe();
    }
  });

  it('initializes fullscreen before applying loaded preferences', () => {
    expect(fullscreen.initialize).toHaveBeenCalledOnce();
    expect(fullscreen.enterFullscreen).not.toHaveBeenCalled();
    settings.setSetting('fullscreenOnStartup', true);
    eventBus.publish(EventChannels.SETTINGS.PREFERENCES_LOADED);
    expect(fullscreen.enterFullscreen).toHaveBeenCalledOnce();
  });

  it('keeps fullscreen disabled when the stored startup setting is false', () => {
    eventBus.publish(EventChannels.SETTINGS.PREFERENCES_LOADED);
    expect(fullscreen.enterFullscreen).not.toHaveBeenCalled();
  });

  it('enters fullscreen only once when the initially hidden window becomes visible', () => {
    settings.setSetting('fullscreenOnStartup', true);
    hidden.setValue(true);
    eventBus.publish(EventChannels.SETTINGS.PREFERENCES_LOADED);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(fullscreen.enterFullscreen).not.toHaveBeenCalled();
    hidden.setValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(fullscreen.enterFullscreen).toHaveBeenCalledOnce();
  });

  it('removes a deferred fullscreen request when preferences change or the owner disposes', async () => {
    settings.setSetting('fullscreenOnStartup', true);
    hidden.setValue(true);
    eventBus.publish(EventChannels.SETTINGS.PREFERENCES_LOADED);
    settings.setSetting('fullscreenOnStartup', false);
    eventBus.publish(EventChannels.SETTINGS.PREFERENCES_LOADED);
    hidden.setValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(fullscreen.enterFullscreen).not.toHaveBeenCalled();

    settings.setSetting('fullscreenOnStartup', true);
    hidden.setValue(true);
    eventBus.publish(EventChannels.SETTINGS.PREFERENCES_LOADED);
    await orchestrator.dispose();
    hidden.setValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(fullscreen.enterFullscreen).not.toHaveBeenCalled();
  });
});
