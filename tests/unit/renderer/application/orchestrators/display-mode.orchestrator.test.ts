/**
 * SettingsDisplayModeOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SettingsDisplayModeOrchestrator } from '@renderer/application/orchestrators/display-mode.orchestrator';
import { createSettingsServiceMock } from '../../../../factories/index.js';
import { createInjectableHarness } from '../../../../support/di/injectable.harness.js';
import { installDocumentPropertyMock } from '../../../../support/mocks/browser-api.installers.js';

describe('SettingsDisplayModeOrchestrator', () => {
  let orchestrator;
  let mockSettingsFullscreenService;
  let mockSettingsCinematicModeService;
  let mockSettingsService;
  let mockEventBus;
  let hiddenMock;

  beforeEach(() => {
    hiddenMock = installDocumentPropertyMock('hidden', false);

    const h = createInjectableHarness(SettingsDisplayModeOrchestrator, {
      overrides: {
        settingsService: createSettingsServiceMock({ values: { fullscreenOnStartup: false } })
      }
    });
    orchestrator = h.subject;
    ({
      fullscreenService: mockSettingsFullscreenService,
      cinematicModeService: mockSettingsCinematicModeService,
      settingsService: mockSettingsService,
      eventBus: mockEventBus
    } = h.deps);
  });

  afterEach(() => {
    hiddenMock.cleanup();
  });

  describe('constructor', () => {
    it('should create orchestrator with dependencies', () => {
      expect(orchestrator.fullscreenService).toBe(mockSettingsFullscreenService);
      expect(orchestrator.cinematicModeService).toBe(mockSettingsCinematicModeService);
      expect(orchestrator.settingsService).toBe(mockSettingsService);
      expect(orchestrator.eventBus).toBe(mockEventBus);
    });
  });

  describe('onInitialize', () => {
    it('should initialize fullscreen service', async () => {
      await orchestrator.onInitialize();

      expect(mockSettingsFullscreenService.initialize).toHaveBeenCalled();
    });

    it('should initialize cinematic mode service', async () => {
      await orchestrator.onInitialize();

      expect(mockSettingsCinematicModeService.initialize).toHaveBeenCalled();
    });
  });

  describe('onCleanup', () => {
    it('should dispose fullscreen service', async () => {
      await orchestrator.onCleanup();

      expect(mockSettingsFullscreenService.dispose).toHaveBeenCalled();
    });

    it('should dispose cinematic mode service', async () => {
      await orchestrator.onCleanup();

      expect(mockSettingsCinematicModeService.dispose).toHaveBeenCalled();
    });
  });

  describe('_applyStartupBehaviors', () => {
    it('should enter fullscreen when fullscreenOnStartup is enabled', () => {
      mockSettingsService.setSetting('fullscreenOnStartup', true);

      orchestrator._applyStartupBehaviors();

      expect(mockSettingsService.getBooleanSetting).toHaveBeenCalledWith('fullscreenOnStartup');
      expect(mockSettingsFullscreenService.enterFullscreen).toHaveBeenCalled();
    });

    it('should not enter fullscreen when fullscreenOnStartup is disabled', () => {
      mockSettingsService.setSetting('fullscreenOnStartup', false);

      orchestrator._applyStartupBehaviors();

      expect(mockSettingsFullscreenService.enterFullscreen).not.toHaveBeenCalled();
    });

    it('should remove deferred startup fullscreen listener during cleanup', async () => {
      mockSettingsService.setSetting('fullscreenOnStartup', true);
      hiddenMock.setValue(true);
      const addListenerSpy = vi.spyOn(document, 'addEventListener');
      const removeListenerSpy = vi.spyOn(document, 'removeEventListener');

      orchestrator._applyStartupBehaviors();
      await orchestrator.onCleanup();

      expect(addListenerSpy).toHaveBeenCalled();
      expect(addListenerSpy.mock.calls[0][0]).toBe('visibilitychange');
      expect(typeof addListenerSpy.mock.calls[0][1]).toBe('function');

      expect(removeListenerSpy).toHaveBeenCalled();
      expect(removeListenerSpy.mock.calls[0][0]).toBe('visibilitychange');
      expect(typeof removeListenerSpy.mock.calls[0][1]).toBe('function');
    });
  });
});
