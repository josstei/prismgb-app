/**
 * ShaderSelectorComponent Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ShaderSelectorComponent } from '@renderer/presentation/features/toolbar/components/shader-selector.component.js';
import { createAppState, createEventBus, createLogger, createSettingsServiceMock } from '../../../factories/index.js';

let mockCinematicToggle;
let mockPresetList;
let mockSliderControls;

vi.mock('@renderer/presentation/features/toolbar/components/cinematic-toggle.component.js', () => ({
  CinematicToggleComponent: vi.fn().mockImplementation(function CinematicToggleComponentMock() {
    this.initialize = vi.fn();
    this.dispose = vi.fn();
    mockCinematicToggle = this;
  })
}));

vi.mock('@renderer/presentation/features/toolbar/components/shader-preset-list.component.js', () => ({
  ShaderPresetListComponent: vi.fn().mockImplementation(function ShaderPresetListComponentMock() {
    this.initialize = vi.fn();
    this.dispose = vi.fn();
    mockPresetList = this;
  })
}));

vi.mock('@renderer/presentation/features/toolbar/components/shader-slider-controls.component.js', () => ({
  ShaderSliderControlsComponent: vi.fn().mockImplementation(function ShaderSliderControlsComponentMock() {
    this.initialize = vi.fn();
    this.dispose = vi.fn();
    mockSliderControls = this;
  })
}));

describe('ShaderSelectorComponent', () => {
  let component;
  let mockSettingsService;
  let mockEventBus;
  let mockLogger;
  let mockElements;

  beforeEach(() => {
    mockSettingsService = createSettingsServiceMock();
    mockEventBus = createEventBus();
    mockLogger = createLogger({ name: 'ShaderSelectorComponent' });

    mockElements = {
      shaderBtn: document.createElement('button'),
      shaderDropdown: document.createElement('div'),
      shaderOptions: document.createElement('div'),
      shaderUnavailableMessage: document.createElement('div'),
      cinematicToggle: document.createElement('button'),
      cinematicPillText: document.createElement('span'),
      brightnessSlider: document.createElement('input'),
      brightnessPercentage: document.createElement('span'),
      brightnessControl: document.createElement('div'),
      volumeSlider: document.createElement('input'),
      volumePercentage: document.createElement('span'),
      streamVideo: document.createElement('video')
    };

    component = new ShaderSelectorComponent({
      settingsService: mockSettingsService,
      appState: createAppState({ initialState: { isCinematicModeEnabled: true } }),
      eventBus: mockEventBus,
      logger: mockLogger
    });
  });

  afterEach(() => {
    component.dispose();
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should warn if required elements are missing', () => {
      component.initialize({});

      expect(mockLogger.warn).toHaveBeenCalledWith('Shader selector elements not found');
    });

    it('should initialize subcomponents with expected elements', () => {
      component.initialize(mockElements);

      expect(mockCinematicToggle.initialize).toHaveBeenCalledWith({
        toggleElement: mockElements.cinematicToggle,
        textElement: mockElements.cinematicPillText
      });

      expect(mockPresetList.initialize).toHaveBeenCalledWith({
        optionsContainer: mockElements.shaderOptions,
        unavailableMessage: mockElements.shaderUnavailableMessage
      });

      expect(mockSliderControls.initialize).toHaveBeenCalledWith({
        brightnessSlider: mockElements.brightnessSlider,
        brightnessPercentage: mockElements.brightnessPercentage,
        brightnessControl: mockElements.brightnessControl,
        volumeSlider: mockElements.volumeSlider,
        volumePercentage: mockElements.volumePercentage,
        streamVideo: mockElements.streamVideo
      });
    });

    it('should log initialization success', () => {
      component.initialize(mockElements);

      expect(mockLogger.debug).toHaveBeenCalledWith('ShaderSelectorComponent initialized');
    });
  });

  describe('panel visibility', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should show panel with visible class and panel-open button', () => {
      component.show();

      expect(mockElements.shaderDropdown.classList.contains('visible')).toBe(true);
      expect(mockElements.shaderBtn.classList.contains('panel-open')).toBe(true);
      expect(component.isVisible).toBe(true);
      expect(mockElements.shaderBtn.getAttribute('aria-expanded')).toBe('true');
    });

    it('should hide panel and reset state', () => {
      component.show();
      component.hide();

      expect(mockElements.shaderDropdown.classList.contains('visible')).toBe(false);
      expect(mockElements.shaderBtn.classList.contains('panel-open')).toBe(false);
      expect(component.isVisible).toBe(false);
      expect(mockElements.shaderBtn.getAttribute('aria-expanded')).toBe('false');
    });

    it('should toggle panel visibility', () => {
      component.toggle();
      expect(component.isVisible).toBe(true);

      component.toggle();
      expect(component.isVisible).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should dispose subcomponents and disclosure', () => {
      component.initialize(mockElements);
      const disclosure = component._panelDisclosure;
      const disclosureSpy = vi.spyOn(disclosure, 'dispose');

      component.dispose();

      expect(mockPresetList.dispose).toHaveBeenCalled();
      expect(mockSliderControls.dispose).toHaveBeenCalled();
      expect(mockCinematicToggle.dispose).toHaveBeenCalled();
      expect(disclosureSpy).toHaveBeenCalled();
    });
  });
});
