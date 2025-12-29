/**
 * ShaderSelectorComponent Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ShaderSelectorComponent } from '@renderer/features/streaming/ui/shader-selector.component.js';

// Mock the render presets module
vi.mock('@renderer/features/streaming/rendering/presets/render.presets.js', () => ({
  getPresetsForUI: vi.fn(() => [
    { id: 'true-color', name: 'True Color', description: 'Accurate GBC colors' },
    { id: 'vibrant', name: 'Vibrant', description: 'Boosted colors for modern displays' },
    { id: 'hi-def', name: 'Hi-Def', description: 'Maximum clarity and sharpness' },
    { id: 'performance', name: 'Performance', description: 'Minimal processing for weak GPUs' }
  ])
}));

describe('ShaderSelectorComponent', () => {
  let component;
  let mockSettingsService;
  let mockEventBus;
  let mockLogger;
  let mockElements;

  beforeEach(() => {
    // Mock settings service
    mockSettingsService = {
      getRenderPreset: vi.fn(() => 'vibrant'),
      setRenderPreset: vi.fn(),
      getGlobalBrightness: vi.fn(() => 1.0),
      setGlobalBrightness: vi.fn(),
      getVolume: vi.fn(() => 70),
      setVolume: vi.fn(),
      getPerformanceMode: vi.fn(() => false)
    };

    // Mock event bus
    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn(() => vi.fn()) // Returns unsubscribe function
    };

    // Mock logger
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    // Create mock DOM elements with required structure
    const shaderDropdown = document.createElement('div');
    const shaderOptions = document.createElement('div');
    shaderOptions.className = 'shader-options';
    shaderDropdown.appendChild(shaderOptions);

    const brightnessSlider = document.createElement('input');
    brightnessSlider.type = 'range';
    brightnessSlider.value = '50';

    const brightnessPercentage = document.createElement('span');
    brightnessPercentage.textContent = '50%';

    mockElements = {
      shaderBtn: document.createElement('button'),
      shaderDropdown: shaderDropdown,
      brightnessSlider: brightnessSlider,
      brightnessPercentage: brightnessPercentage
    };

    component = new ShaderSelectorComponent({
      settingsService: mockSettingsService,
      eventBus: mockEventBus,
      logger: mockLogger
    });
  });

  afterEach(() => {
    component.dispose();
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create component with default state', () => {
      expect(component.isVisible).toBe(false);
      expect(component.currentPresetId).toBeNull();
    });
  });

  describe('initialize', () => {
    it('should initialize with DOM elements', () => {
      component.initialize(mockElements);

      expect(component.button).toBe(mockElements.shaderBtn);
      expect(component.dropdown).toBe(mockElements.shaderDropdown);
    });

    it('should warn if required elements are missing', () => {
      component.initialize({});

      expect(mockLogger.warn).toHaveBeenCalledWith('Shader selector elements not found');
    });

    it('should load current preset on initialize', () => {
      component.initialize(mockElements);

      expect(mockSettingsService.getRenderPreset).toHaveBeenCalled();
      expect(component.currentPresetId).toBe('vibrant');
    });

    it('should render preset list on initialize', () => {
      component.initialize(mockElements);

      const options = mockElements.shaderDropdown.querySelectorAll('.shader-option');
      // 3 options + 1 pill element
      expect(options.length).toBe(3);
    });

    it('should mark current preset as active', () => {
      component.initialize(mockElements);

      const activeOption = mockElements.shaderDropdown.querySelector('.shader-option.active');
      expect(activeOption).not.toBeNull();
      expect(activeOption.dataset.presetId).toBe('vibrant');
    });

    it('should subscribe to render preset changed events', () => {
      component.initialize(mockElements);

      expect(mockEventBus.subscribe).toHaveBeenCalled();
    });

    it('should log initialization success', () => {
      component.initialize(mockElements);

      expect(mockLogger.debug).toHaveBeenCalledWith('ShaderSelectorComponent initialized');
    });
  });

  describe('toggle', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should show dropdown when hidden', () => {
      component.toggle();

      expect(component.isVisible).toBe(true);
      expect(mockElements.shaderDropdown.classList.contains('visible')).toBe(true);
    });

    it('should hide dropdown when visible', () => {
      component.show();
      component.toggle();

      expect(component.isVisible).toBe(false);
      expect(mockElements.shaderDropdown.classList.contains('visible')).toBe(false);
    });
  });

  describe('show', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should display the dropdown', () => {
      component.show();

      expect(mockElements.shaderDropdown.classList.contains('visible')).toBe(true);
      expect(component.isVisible).toBe(true);
    });

    it('should set aria-expanded on button', () => {
      component.show();

      expect(mockElements.shaderBtn.getAttribute('aria-expanded')).toBe('true');
    });

    it('should log when shown', () => {
      component.show();

      expect(mockLogger.debug).toHaveBeenCalledWith('Shader panel shown');
    });
  });

  describe('hide', () => {
    beforeEach(() => {
      component.initialize(mockElements);
      component.show();
    });

    it('should hide the dropdown', () => {
      component.hide();

      expect(mockElements.shaderDropdown.classList.contains('visible')).toBe(false);
      expect(component.isVisible).toBe(false);
    });

    it('should set aria-expanded to false', () => {
      component.hide();

      expect(mockElements.shaderBtn.getAttribute('aria-expanded')).toBe('false');
    });

    it('should log when hidden', () => {
      component.hide();

      expect(mockLogger.debug).toHaveBeenCalledWith('Shader panel hidden');
    });
  });

  describe('Preset selection', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should call settings service when selecting preset', () => {
      const option = mockElements.shaderDropdown.querySelector('[data-preset-id="hi-def"]');
      option.click();

      expect(mockSettingsService.setRenderPreset).toHaveBeenCalledWith('hi-def');
    });

    it('should update current preset id', () => {
      const option = mockElements.shaderDropdown.querySelector('[data-preset-id="hi-def"]');
      option.click();

      expect(component.currentPresetId).toBe('hi-def');
    });

    it('should update active state on options', () => {
      const option = mockElements.shaderDropdown.querySelector('[data-preset-id="hi-def"]');
      option.click();

      const activeOption = mockElements.shaderDropdown.querySelector('.shader-option.active');
      expect(activeOption.dataset.presetId).toBe('hi-def');
    });

    it('should keep dropdown open after selection', () => {
      component.show();
      const option = mockElements.shaderDropdown.querySelector('[data-preset-id="hi-def"]');
      option.click();

      // Dropdown stays open - only closes on click outside or escape
      expect(component.isVisible).toBe(true);
    });

    it('should not call settings service when selecting same preset', () => {
      const option = mockElements.shaderDropdown.querySelector('[data-preset-id="vibrant"]');
      option.click();

      expect(mockSettingsService.setRenderPreset).not.toHaveBeenCalled();
    });
  });

  describe('Click outside', () => {
    beforeEach(() => {
      component.initialize(mockElements);
      component.show();
    });

    it('should hide dropdown when clicking outside', () => {
      const outsideElement = document.createElement('div');
      outsideElement.closest = vi.fn(() => null);

      const clickEvent = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(clickEvent, 'target', {
        value: outsideElement,
        enumerable: true
      });

      document.dispatchEvent(clickEvent);

      expect(component.isVisible).toBe(false);
    });

    it('should not hide when clicking inside dropdown', () => {
      const insideElement = document.createElement('div');
      insideElement.closest = vi.fn((selector) => {
        if (selector === '.shader-panel') return mockElements.shaderDropdown;
        return null;
      });

      const clickEvent = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(clickEvent, 'target', {
        value: insideElement,
        enumerable: true
      });

      document.dispatchEvent(clickEvent);

      expect(component.isVisible).toBe(true);
    });
  });

  describe('Escape key', () => {
    beforeEach(() => {
      component.initialize(mockElements);
      component.show();
    });

    it('should hide dropdown on Escape key', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(component.isVisible).toBe(false);
    });

    it('should not hide when not visible', () => {
      component.hide();

      const hideSpy = vi.spyOn(component, 'hide');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(hideSpy).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should remove all DOM listeners', () => {
      component.initialize(mockElements);

      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      component.dispose();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function), undefined);
      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function), undefined);
    });

    it('should clear event subscriptions', () => {
      component.initialize(mockElements);

      component.dispose();

      expect(component._eventSubscriptions.length).toBe(0);
    });

    it('should clear all listeners via manager', () => {
      component.initialize(mockElements);
      expect(component._domListeners.count()).toBeGreaterThan(0);

      component.dispose();

      expect(component._domListeners.count()).toBe(0);
    });
  });
});
