/**
 * SettingsDisplayModeOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsDisplayModeOrchestrator } from '@renderer/application/orchestrators/display-mode.orchestrator.ts';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';

describe('SettingsDisplayModeOrchestrator', () => {
  let orchestrator;
  let mockFullscreenService;
  let mockAppState;
  let mockSettingsService;
  let mockEventBus;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    mockFullscreenService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      toggleFullscreen: vi.fn(),
      enterFullscreen: vi.fn(),
      exitFullscreen: vi.fn()
    };

    mockAppState = {
      isCinematicModeEnabled: false,
      setCinematicMode: vi.fn()
    };

    mockSettingsService = {
      getFullscreenOnStartup: vi.fn(() => false)
    };

    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn(() => vi.fn())
    };

    orchestrator = new SettingsDisplayModeOrchestrator({
      fullscreenService: mockFullscreenService,
      appState: mockAppState,
      settingsService: mockSettingsService,
      eventBus: mockEventBus,
      loggerFactory: { create: vi.fn(() => mockLogger) }
    });
  });

  it('initializes and disposes fullscreen service', async () => {
    await orchestrator.onInitialize();
    expect(mockFullscreenService.initialize).toHaveBeenCalled();

    await orchestrator.onCleanup();
    expect(mockFullscreenService.dispose).toHaveBeenCalled();
  });

  it('delegates fullscreen controls', () => {
    orchestrator.toggleFullscreen();
    orchestrator.enterFullscreen();
    orchestrator.exitFullscreen();

    expect(mockFullscreenService.toggleFullscreen).toHaveBeenCalled();
    expect(mockFullscreenService.enterFullscreen).toHaveBeenCalled();
    expect(mockFullscreenService.exitFullscreen).toHaveBeenCalled();
  });

  it('toggles cinematic mode in appState and publishes settings event', () => {
    mockAppState.isCinematicModeEnabled = false;
    orchestrator.toggleCinematicMode();

    expect(mockAppState.setCinematicMode).toHaveBeenCalledWith(true);
    expect(mockEventBus.publish).toHaveBeenCalledWith(
      EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED,
      { enabled: true }
    );
  });

  it('applies startup fullscreen behavior from settings', () => {
    mockSettingsService.getFullscreenOnStartup.mockReturnValue(true);
    orchestrator._applyStartupBehaviors();
    expect(mockFullscreenService.enterFullscreen).toHaveBeenCalled();
  });
});
