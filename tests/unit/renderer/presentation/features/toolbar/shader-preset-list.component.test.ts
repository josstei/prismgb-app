/**
 * ShaderPresetListComponent Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ShaderPresetListComponent } from '@renderer/presentation/features/toolbar/shader-preset-list.component.js';
import { createEventBus, createLogger, createSettingsServiceMock } from '../../../../../factories/index.js';
import { EventChannels } from '@prismgb/events';
import { PRESET_POLICY, PresetRegistry } from '@prismgb/gpu';

const uiPresets = PresetRegistry.getForUI();
const selectablePresetId = uiPresets.find(
  (preset) => preset.id !== PRESET_POLICY.rendererDefaultId
)?.id;

describe('ShaderPresetListComponent', () => {
  let component;
  let mockEventBus;
  let mockSettingsService;
  let mockLogger;
  let optionsContainer;
  let unavailableMessage;

  beforeEach(() => {
    mockEventBus = createEventBus();
    mockSettingsService = createSettingsServiceMock();
    mockLogger = createLogger();

    optionsContainer = document.createElement('div');
    unavailableMessage = document.createElement('div');

    document.body.appendChild(optionsContainer);
    document.body.appendChild(unavailableMessage);

    component = new ShaderPresetListComponent({
      settingsService: mockSettingsService,
      eventBus: mockEventBus,
      logger: mockLogger
    });
  });

  afterEach(() => {
    component?.dispose();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should store dependencies', () => {
      expect(component.settingsService).toBe(mockSettingsService);
      expect(component.eventBus).toBe(mockEventBus);
      expect(component.logger).toBe(mockLogger);
    });

    it('should initialize with null element references', () => {
      expect(component.optionsContainer).toBeNull();
      expect(component.unavailableMessage).toBeNull();
    });
  });

  describe('initialize', () => {
    it('should warn when options container is missing', () => {
      component.initialize({ optionsContainer: null, unavailableMessage });
      expect(mockLogger.warn).toHaveBeenCalledWith('Shader preset list elements not found');
    });

    it('should warn when unavailable message is missing', () => {
      component.initialize({ optionsContainer, unavailableMessage: null });
      expect(mockLogger.warn).toHaveBeenCalledWith('Shader preset list elements not found');
    });

    it('should store element references', () => {
      component.initialize({ optionsContainer, unavailableMessage });
      expect(component.optionsContainer).toBe(optionsContainer);
      expect(component.unavailableMessage).toBe(unavailableMessage);
    });

    it('should load current preset from settings', () => {
      component.initialize({ optionsContainer, unavailableMessage });
      expect(mockSettingsService.getStringSetting).toHaveBeenCalledWith('renderPreset');
      expect(component.currentPresetId).toBe(PRESET_POLICY.rendererDefaultId);
    });

    it('should load performance mode state', () => {
      component.initialize({ optionsContainer, unavailableMessage });
      expect(mockSettingsService.getBooleanSetting).toHaveBeenCalledWith('performanceMode');
    });

    it('should render preset list', () => {
      component.initialize({ optionsContainer, unavailableMessage });
      const options = optionsContainer.querySelectorAll('.shader-option');
      expect(options.length).toBe(uiPresets.length);
      expect([...options].map((option) => option.dataset.presetId)).toEqual(
        uiPresets.map((preset) => preset.id)
      );
      expect([...options].map((option) => option.dataset.presetId)).not.toContain(
        PRESET_POLICY.performancePresetId
      );
    });

    it('should mark current preset as active', () => {
      component.initialize({ optionsContainer, unavailableMessage });
      const activeOption = optionsContainer.querySelector('.shader-option.active');
      expect(activeOption).not.toBeNull();
      expect(activeOption.dataset.presetId).toBe(PRESET_POLICY.rendererDefaultId);
    });

    it('should subscribe to events', () => {
      component.initialize({ optionsContainer, unavailableMessage });
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.SETTINGS.RENDER_PRESET_CHANGED,
        expect.any(Function)
      );
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.PERFORMANCE.RENDER_MODE_CHANGED,
        expect.any(Function)
      );
    });

    it('should log debug message on success', () => {
      component.initialize({ optionsContainer, unavailableMessage });
      expect(mockLogger.debug).toHaveBeenCalledWith('Shader preset list initialized');
    });
  });

  describe('preset selection', () => {
    beforeEach(() => {
      component.initialize({ optionsContainer, unavailableMessage });
    });

    it('should select preset on click', () => {
      const targetOption = optionsContainer.querySelector(`[data-preset-id="${selectablePresetId}"]`);
      targetOption.click();

      expect(mockSettingsService.setSetting).toHaveBeenCalledWith('renderPreset', selectablePresetId);
      expect(component.currentPresetId).toBe(selectablePresetId);
    });

    it('should update active state on selection', () => {
      const targetOption = optionsContainer.querySelector(`[data-preset-id="${selectablePresetId}"]`);
      targetOption.click();

      expect(targetOption.classList.contains('active')).toBe(true);
      const defaultOption = optionsContainer.querySelector(
        `[data-preset-id="${PRESET_POLICY.rendererDefaultId}"]`
      );
      expect(defaultOption.classList.contains('active')).toBe(false);
    });

    it('should add just-selected class for animation', () => {
      const targetOption = optionsContainer.querySelector(`[data-preset-id="${selectablePresetId}"]`);
      targetOption.click();

      expect(targetOption.classList.contains('just-selected')).toBe(true);
    });

    it('should not re-select current preset', () => {
      const defaultOption = optionsContainer.querySelector(
        `[data-preset-id="${PRESET_POLICY.rendererDefaultId}"]`
      );
      defaultOption.click();

      expect(mockSettingsService.setSetting).not.toHaveBeenCalled();
    });

    it('should not allow selection in performance mode', () => {
      mockSettingsService.setSetting('performanceMode', true);
      mockSettingsService.setSetting.mockClear();
      component._performanceModeEnabled.value = true;

      const targetOption = optionsContainer.querySelector(`[data-preset-id="${selectablePresetId}"]`);
      targetOption.click();

      expect(mockSettingsService.setSetting).not.toHaveBeenCalled();
    });
  });

  describe('performance mode', () => {
    beforeEach(() => {
      component.initialize({ optionsContainer, unavailableMessage });
    });

    it('should hide options when performance mode enabled', () => {
      mockEventBus.publish(EventChannels.PERFORMANCE.RENDER_MODE_CHANGED, true);

      expect(optionsContainer.classList.contains('hidden')).toBe(true);
      expect(unavailableMessage.classList.contains('hidden')).toBe(false);
    });

    it('should show options when performance mode disabled', () => {
      mockEventBus.publish(EventChannels.PERFORMANCE.RENDER_MODE_CHANGED, true);
      expect(optionsContainer.classList.contains('hidden')).toBe(true);

      mockEventBus.publish(EventChannels.PERFORMANCE.RENDER_MODE_CHANGED, false);

      expect(optionsContainer.classList.contains('hidden')).toBe(false);
      expect(unavailableMessage.classList.contains('hidden')).toBe(true);
    });
  });

  describe('external preset changes', () => {
    beforeEach(() => {
      component.initialize({ optionsContainer, unavailableMessage });
    });

    it('should update when preset changed externally', () => {
      mockEventBus.publish(EventChannels.SETTINGS.RENDER_PRESET_CHANGED, selectablePresetId);

      expect(component.currentPresetId).toBe(selectablePresetId);
      const targetOption = optionsContainer.querySelector(`[data-preset-id="${selectablePresetId}"]`);
      expect(targetOption.classList.contains('active')).toBe(true);
    });

    it('should not update if preset is the same', () => {
      const initialActiveOption = optionsContainer.querySelector('.shader-option.active');
      mockEventBus.publish(EventChannels.SETTINGS.RENDER_PRESET_CHANGED, PRESET_POLICY.rendererDefaultId);

      // Should still be the same
      expect(component.currentPresetId).toBe(PRESET_POLICY.rendererDefaultId);
    });
  });

  describe('dispose', () => {
    it('should clean up event subscriptions', () => {
      component.initialize({ optionsContainer, unavailableMessage });

      const unsubscribeFns = mockEventBus.subscribe.mock.results.map(r => r.value);
      component.dispose();

      unsubscribeFns.forEach(fn => {
        expect(fn).toHaveBeenCalled();
      });
    });

    it('should nullify references', () => {
      component.initialize({ optionsContainer, unavailableMessage });
      component.dispose();

      expect(component.optionsContainer).toBeNull();
      expect(component.unavailableMessage).toBeNull();
    });

    it('should handle non-function unsubscribe gracefully', () => {
      component.initialize({ optionsContainer, unavailableMessage });
      component._eventSubscriptions = ['not-a-function'];

      expect(() => component.dispose()).not.toThrow();
    });
  });

  describe('_renderPresetList edge cases', () => {
    it('should handle null options container', () => {
      component.optionsContainer = null;
      expect(() => component._renderPresetList()).not.toThrow();
    });
  });

  describe('_updateActiveState edge cases', () => {
    it('should handle null options container', () => {
      component.optionsContainer = null;
      expect(() => component._updateActiveState()).not.toThrow();
    });
  });

  describe('null element handling', () => {
    it('does not throw when elements are missing', () => {
      const bare = new ShaderPresetListComponent({
        settingsService: mockSettingsService,
        eventBus: mockEventBus,
        logger: mockLogger
      });
      expect(() => bare.initialize({ optionsContainer: null, unavailableMessage: null })).not.toThrow();
      bare.dispose();
    });
  });
});
