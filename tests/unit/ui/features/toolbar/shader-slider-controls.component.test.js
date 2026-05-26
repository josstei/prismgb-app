/**
 * ShaderSliderControlsComponent Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ShaderSliderControlsComponent } from '@renderer/presentation/features/toolbar/components/shader-slider-controls.component.js';
import { createEventBus, createLogger, createSettingsServiceMock } from '../../../../factories/index.js';
import { EventChannels } from '@shared/events/event-channels.js';

describe('ShaderSliderControlsComponent', () => {
  let component;
  let mockEventBus;
  let mockSettingsService;
  let mockLogger;
  let brightnessSlider;
  let brightnessPercentage;
  let brightnessControl;
  let volumeSlider;
  let volumePercentage;
  let streamVideo;

  beforeEach(() => {
    mockEventBus = createEventBus();
    mockSettingsService = createSettingsServiceMock();
    mockLogger = createLogger();

    brightnessSlider = document.createElement('input');
    brightnessSlider.type = 'range';
    brightnessSlider.min = '0';
    brightnessSlider.max = '100';
    brightnessSlider.value = '50';

    brightnessPercentage = document.createElement('span');
    brightnessControl = document.createElement('div');

    volumeSlider = document.createElement('input');
    volumeSlider.type = 'range';
    volumeSlider.min = '0';
    volumeSlider.max = '100';
    volumeSlider.value = '70';

    volumePercentage = document.createElement('span');

    streamVideo = document.createElement('video');

    document.body.appendChild(brightnessSlider);
    document.body.appendChild(brightnessPercentage);
    document.body.appendChild(brightnessControl);
    document.body.appendChild(volumeSlider);
    document.body.appendChild(volumePercentage);
    document.body.appendChild(streamVideo);

    component = new ShaderSliderControlsComponent({
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

    it('should initialize with default values', () => {
      expect(component.currentBrightness).toBe(1.0);
      expect(component.currentVolume).toBe(70);
      expect(component._performanceModeEnabled).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should warn when no sliders are provided', () => {
      component.initialize({
        brightnessSlider: null,
        volumeSlider: null
      });
      expect(mockLogger.warn).toHaveBeenCalledWith('Shader slider elements not found');
    });

    it('should store element references', () => {
      component.initialize({
        brightnessSlider,
        brightnessPercentage,
        brightnessControl,
        volumeSlider,
        volumePercentage,
        streamVideo
      });

      expect(component.brightnessSlider).toBe(brightnessSlider);
      expect(component.volumeSlider).toBe(volumeSlider);
      expect(component.streamVideo).toBe(streamVideo);
    });

    it('should load current brightness', () => {
      component.initialize({
        brightnessSlider,
        brightnessPercentage,
        brightnessControl,
        volumeSlider,
        volumePercentage,
        streamVideo
      });

      expect(mockSettingsService.getNumberSetting).toHaveBeenCalledWith('globalBrightness');
      expect(brightnessSlider.value).toBe('50'); // brightnessToSlider(1.0) = 50
    });

    it('should load current volume', () => {
      component.initialize({
        brightnessSlider,
        brightnessPercentage,
        brightnessControl,
        volumeSlider,
        volumePercentage,
        streamVideo
      });

      expect(mockSettingsService.getNumberSetting).toHaveBeenCalledWith('gameVolume');
      expect(volumeSlider.value).toBe('70');
    });

    it('should apply volume to video element', () => {
      component.initialize({
        brightnessSlider,
        brightnessPercentage,
        brightnessControl,
        volumeSlider,
        volumePercentage,
        streamVideo
      });

      expect(streamVideo.volume).toBe(0.7); // 70 / 100
    });

    it('should subscribe to events', () => {
      component.initialize({
        brightnessSlider,
        brightnessPercentage,
        brightnessControl,
        volumeSlider,
        volumePercentage,
        streamVideo
      });

      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.SETTINGS.BRIGHTNESS_CHANGED,
        expect.any(Function)
      );
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.SETTINGS.VOLUME_CHANGED,
        expect.any(Function)
      );
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.PERFORMANCE.RENDER_MODE_CHANGED,
        expect.any(Function)
      );
    });

    it('should log debug message on success', () => {
      component.initialize({
        brightnessSlider,
        brightnessPercentage,
        brightnessControl,
        volumeSlider,
        volumePercentage,
        streamVideo
      });

      expect(mockLogger.debug).toHaveBeenCalledWith('Shader slider controls initialized');
    });
  });

  describe('brightness slider', () => {
    beforeEach(() => {
      component.initialize({
        brightnessSlider,
        brightnessPercentage,
        brightnessControl,
        volumeSlider,
        volumePercentage,
        streamVideo
      });
    });

    it('should update display on input event', () => {
      brightnessSlider.value = '75';
      brightnessSlider.dispatchEvent(new Event('input'));

      expect(brightnessPercentage.textContent).toBe('75%');
    });

    it('should publish event on input (live update)', () => {
      brightnessSlider.value = '75';
      brightnessSlider.dispatchEvent(new Event('input'));

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.SETTINGS.BRIGHTNESS_CHANGED,
        1.25 // sliderToBrightness(75) = 1.25
      );
    });

    it('should save to settings on change event', () => {
      brightnessSlider.value = '75';
      brightnessSlider.dispatchEvent(new Event('change'));

      expect(mockSettingsService.setSetting).toHaveBeenCalledWith('globalBrightness', 1.25);
    });

    it('should update slider from external brightness change', () => {
      mockEventBus.publish(EventChannels.SETTINGS.BRIGHTNESS_CHANGED, 1.25);

      expect(brightnessSlider.value).toBe('75');
      expect(brightnessPercentage.textContent).toBe('75%');
    });

    it('should ignore small external brightness changes', () => {
      const originalValue = brightnessSlider.value;
      mockEventBus.publish(EventChannels.SETTINGS.BRIGHTNESS_CHANGED, 1.005);

      expect(brightnessSlider.value).toBe(originalValue);
    });
  });

  describe('volume slider', () => {
    beforeEach(() => {
      component.initialize({
        brightnessSlider,
        brightnessPercentage,
        brightnessControl,
        volumeSlider,
        volumePercentage,
        streamVideo
      });
    });

    it('should update display on input event', () => {
      volumeSlider.value = '50';
      volumeSlider.dispatchEvent(new Event('input'));

      expect(volumePercentage.textContent).toBe('50%');
    });

    it('should apply volume to video on input', () => {
      volumeSlider.value = '50';
      volumeSlider.dispatchEvent(new Event('input'));

      expect(streamVideo.volume).toBe(0.5);
    });

    it('should publish event on input (live update)', () => {
      volumeSlider.value = '50';
      volumeSlider.dispatchEvent(new Event('input'));

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.SETTINGS.VOLUME_CHANGED,
        50
      );
    });

    it('should save to settings on change event', () => {
      volumeSlider.value = '50';
      volumeSlider.dispatchEvent(new Event('change'));

      expect(mockSettingsService.setSetting).toHaveBeenCalledWith('gameVolume', 50);
    });

    it('should update slider from external volume change', () => {
      mockEventBus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, 50);

      expect(volumeSlider.value).toBe('50');
      expect(volumePercentage.textContent).toBe('50%');
      expect(streamVideo.volume).toBe(0.5);
    });

    it('should ignore small external volume changes', () => {
      const originalValue = volumeSlider.value;
      mockEventBus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, 70.4);

      expect(volumeSlider.value).toBe(originalValue);
    });
  });

  describe('performance mode', () => {
    beforeEach(() => {
      component.initialize({
        brightnessSlider,
        brightnessPercentage,
        brightnessControl,
        volumeSlider,
        volumePercentage,
        streamVideo
      });
    });

    it('should hide brightness control when performance mode enabled', () => {
      mockEventBus.publish(EventChannels.PERFORMANCE.RENDER_MODE_CHANGED, true);

      expect(brightnessControl.classList.contains('hidden')).toBe(true);
    });

    it('should show brightness control when performance mode disabled', () => {
      brightnessControl.classList.add('hidden');
      mockEventBus.publish(EventChannels.PERFORMANCE.RENDER_MODE_CHANGED, false);

      expect(brightnessControl.classList.contains('hidden')).toBe(false);
    });
  });

  describe('partial initialization', () => {
    it('should work with only brightness slider', () => {
      component.initialize({
        brightnessSlider,
        brightnessPercentage,
        brightnessControl,
        volumeSlider: null,
        volumePercentage: null,
        streamVideo: null
      });

      brightnessSlider.value = '75';
      brightnessSlider.dispatchEvent(new Event('input'));

      expect(brightnessPercentage.textContent).toBe('75%');
    });

    it('should work with only volume slider', () => {
      component.initialize({
        brightnessSlider: null,
        brightnessPercentage: null,
        brightnessControl: null,
        volumeSlider,
        volumePercentage,
        streamVideo
      });

      volumeSlider.value = '50';
      volumeSlider.dispatchEvent(new Event('input'));

      expect(volumePercentage.textContent).toBe('50%');
    });
  });

  describe('edge cases', () => {
    it('should handle missing brightnessPercentage', () => {
      component.initialize({
        brightnessSlider,
        brightnessPercentage: null,
        brightnessControl,
        volumeSlider,
        volumePercentage,
        streamVideo
      });

      expect(() => {
        brightnessSlider.value = '75';
        brightnessSlider.dispatchEvent(new Event('input'));
      }).not.toThrow();
    });

    it('should handle missing volumePercentage', () => {
      component.initialize({
        brightnessSlider,
        brightnessPercentage,
        brightnessControl,
        volumeSlider,
        volumePercentage: null,
        streamVideo
      });

      expect(() => {
        volumeSlider.value = '50';
        volumeSlider.dispatchEvent(new Event('input'));
      }).not.toThrow();
    });

    it('should handle missing streamVideo', () => {
      component.initialize({
        brightnessSlider,
        brightnessPercentage,
        brightnessControl,
        volumeSlider,
        volumePercentage,
        streamVideo: null
      });

      expect(() => {
        volumeSlider.value = '50';
        volumeSlider.dispatchEvent(new Event('input'));
      }).not.toThrow();
    });

    it('should handle null brightnessControl', () => {
      component.initialize({
        brightnessSlider,
        brightnessPercentage,
        brightnessControl: null,
        volumeSlider,
        volumePercentage,
        streamVideo
      });

      expect(() => component._updateBrightnessControlVisibility()).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('should clean up event subscriptions', () => {
      component.initialize({
        brightnessSlider,
        brightnessPercentage,
        brightnessControl,
        volumeSlider,
        volumePercentage,
        streamVideo
      });

      const unsubscribeFns = mockEventBus.subscribe.mock.results.map(r => r.value);
      component.dispose();

      unsubscribeFns.forEach(fn => {
        expect(fn).toHaveBeenCalled();
      });
    });

    it('should nullify all references', () => {
      component.initialize({
        brightnessSlider,
        brightnessPercentage,
        brightnessControl,
        volumeSlider,
        volumePercentage,
        streamVideo
      });

      component.dispose();

      expect(component.brightnessSlider).toBeNull();
      expect(component.brightnessPercentage).toBeNull();
      expect(component.brightnessControl).toBeNull();
      expect(component.volumeSlider).toBeNull();
      expect(component.volumePercentage).toBeNull();
      expect(component.streamVideo).toBeNull();
      expect(component.settingsService).toBeNull();
      expect(component.eventBus).toBeNull();
      expect(component.logger).toBeNull();
    });

    it('should handle non-function unsubscribe gracefully', () => {
      component.initialize({
        brightnessSlider,
        brightnessPercentage,
        brightnessControl,
        volumeSlider,
        volumePercentage,
        streamVideo
      });
      component._eventSubscriptions = ['not-a-function'];

      expect(() => component.dispose()).not.toThrow();
    });
  });
});
