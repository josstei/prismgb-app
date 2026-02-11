/**
 * ShaderPresetListComponent Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ShaderPresetListComponent } from '@renderer/presentation/features/toolbar/components/shader-preset-list.component.js';
import { createMockEventBus, createMockLogger } from '../../../../mocks/index.js';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';

vi.mock('@prismgb/gpu', () => ({
  PresetRegistry: {
    getForUI: () => [
      { id: 'sharp', name: 'Sharp' },
      { id: 'soft', name: 'Soft' },
      { id: 'crt', name: 'CRT' },
      { id: 'performance', name: 'Performance' }
    ]
  }
}));

function createMockSettingsService(overrides = {}) {
  return {
    getRenderPreset: vi.fn(() => 'sharp'),
    setRenderPreset: vi.fn(),
    getPerformanceMode: vi.fn(() => false),
    ...overrides
  };
}

describe('ShaderPresetListComponent', () => {
  let component;
  let mockEventBus;
  let mockSettingsService;
  let mockLogger;
  let optionsContainer;
  let unavailableMessage;

  beforeEach(() => {
    mockEventBus = createMockEventBus();
    mockSettingsService = createMockSettingsService();
    mockLogger = createMockLogger();

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
      expect(mockSettingsService.getRenderPreset).toHaveBeenCalled();
      expect(component.currentPresetId).toBe('sharp');
    });

    it('should load performance mode state', () => {
      component.initialize({ optionsContainer, unavailableMessage });
      expect(mockSettingsService.getPerformanceMode).toHaveBeenCalled();
    });

    it('should render preset list', () => {
      component.initialize({ optionsContainer, unavailableMessage });
      // Should render 3 presets (excluding 'performance')
      const options = optionsContainer.querySelectorAll('.shader-option');
      expect(options.length).toBe(3);
    });

    it('should mark current preset as active', () => {
      component.initialize({ optionsContainer, unavailableMessage });
      const activeOption = optionsContainer.querySelector('.shader-option.active');
      expect(activeOption).not.toBeNull();
      expect(activeOption.dataset.presetId).toBe('sharp');
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
      const softOption = optionsContainer.querySelector('[data-preset-id="soft"]');
      softOption.click();

      expect(mockSettingsService.setRenderPreset).toHaveBeenCalledWith('soft');
      expect(component.currentPresetId).toBe('soft');
    });

    it('should update active state on selection', () => {
      const softOption = optionsContainer.querySelector('[data-preset-id="soft"]');
      softOption.click();

      expect(softOption.classList.contains('active')).toBe(true);
      const sharpOption = optionsContainer.querySelector('[data-preset-id="sharp"]');
      expect(sharpOption.classList.contains('active')).toBe(false);
    });

    it('should add just-selected class for animation', () => {
      const softOption = optionsContainer.querySelector('[data-preset-id="soft"]');
      softOption.click();

      expect(softOption.classList.contains('just-selected')).toBe(true);
    });

    it('should not re-select current preset', () => {
      const sharpOption = optionsContainer.querySelector('[data-preset-id="sharp"]');
      sharpOption.click();

      expect(mockSettingsService.setRenderPreset).not.toHaveBeenCalled();
    });

    it('should not allow selection in performance mode', () => {
      mockSettingsService.getPerformanceMode.mockReturnValue(true);
      component._performanceModeEnabled = true;

      const softOption = optionsContainer.querySelector('[data-preset-id="soft"]');
      softOption.click();

      expect(mockSettingsService.setRenderPreset).not.toHaveBeenCalled();
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
      optionsContainer.classList.add('hidden');
      unavailableMessage.classList.remove('hidden');

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
      mockEventBus.publish(EventChannels.SETTINGS.RENDER_PRESET_CHANGED, 'crt');

      expect(component.currentPresetId).toBe('crt');
      const crtOption = optionsContainer.querySelector('[data-preset-id="crt"]');
      expect(crtOption.classList.contains('active')).toBe(true);
    });

    it('should not update if preset is the same', () => {
      const initialActiveOption = optionsContainer.querySelector('.shader-option.active');
      mockEventBus.publish(EventChannels.SETTINGS.RENDER_PRESET_CHANGED, 'sharp');

      // Should still be the same
      expect(component.currentPresetId).toBe('sharp');
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

    it('should keep element and dependency references stable after dispose', () => {
      component.initialize({ optionsContainer, unavailableMessage });
      component.dispose();

      expect(component.optionsContainer).toBe(optionsContainer);
      expect(component.unavailableMessage).toBe(unavailableMessage);
      expect(component.settingsService).toBe(mockSettingsService);
      expect(component.eventBus).toBe(mockEventBus);
      expect(component.logger).toBe(mockLogger);
      expect(component._eventSubscriptions).toEqual([]);
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

  describe('_updateShaderListVisibility edge cases', () => {
    it('should handle null elements', () => {
      component.optionsContainer = null;
      component.unavailableMessage = null;
      expect(() => component._updateShaderListVisibility()).not.toThrow();
    });
  });
});
