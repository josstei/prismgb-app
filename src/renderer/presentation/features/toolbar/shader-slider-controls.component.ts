import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { PresentationComponent, bindText, bindClass, computed } from '@platform/ui-base';
import { signal } from '@platform/ui-base/reactive';
import { sliderToBrightness, brightnessToSlider } from '@renderer/presentation/features/toolbar/brightness.utils';
import { EventChannels } from '@platform/events';
import type { TypedEventBusLike } from '@platform/events';
import type { LoggerLike } from '@platform/core';

export interface ShaderSliderSettingsService {
  getNumberSetting(name: string): number;
  getBooleanSetting(name: string): boolean;
  setSetting(name: string, value: unknown): boolean | Promise<boolean>;
}

export interface ShaderSliderControlsComponentOptions {
  settingsService: ShaderSliderSettingsService;
  eventBus: TypedEventBusLike;
  logger?: LoggerLike | null;
}

export interface ShaderSliderControlsElements {
  brightnessSlider?: HTMLInputElement | null;
  brightnessPercentage?: HTMLElement | null;
  brightnessControl?: HTMLElement | null;
  volumeSlider?: HTMLInputElement | null;
  volumePercentage?: HTMLElement | null;
  streamVideo?: HTMLVideoElement | null;
}

class ShaderSliderControlsComponent extends PresentationComponent {
  declare settingsService: ShaderSliderSettingsService;
  declare eventBus: TypedEventBusLike;
  declare logger: LoggerLike | null | undefined;
  declare brightnessSlider: HTMLInputElement | null | undefined;
  declare brightnessPercentage: HTMLElement | null | undefined;
  declare brightnessControl: HTMLElement | null | undefined;
  declare volumeSlider: HTMLInputElement | null | undefined;
  declare volumePercentage: HTMLElement | null | undefined;
  declare streamVideo: HTMLVideoElement | null | undefined;
  declare currentBrightness: number;
  declare currentVolume: number;

  private readonly _brightnessPercent = signal(50);
  private readonly _volumePercent = signal(70);
  private readonly _performanceModeEnabled = signal(false);

  constructor(options: ShaderSliderControlsComponentOptions) {
    super();

    this.applyOptions<ShaderSliderControlsComponentOptions>({}, options);

    this.brightnessSlider = null;
    this.brightnessPercentage = null;
    this.brightnessControl = null;
    this.volumeSlider = null;
    this.volumePercentage = null;
    this.streamVideo = null;

    this.currentBrightness = 1.0;
    this.currentVolume = 70;
  }

  initialize(options: ShaderSliderControlsElements): void {
    void this.dispose();
    this.applyOptions<ShaderSliderControlsElements>({}, options);

    if (!this.brightnessSlider && !this.volumeSlider) {
      this.logger?.warn('Shader slider elements not found');
      return;
    }

    this._bindDisplays();
    this._loadCurrentBrightness();
    this._loadCurrentVolume();
    this._loadPerformanceModeState();
    this._setupBrightnessSlider();
    this._setupVolumeSlider();
    this._subscribeToEvents();

    this.logger?.debug('Shader slider controls initialized');
  }

  _bindDisplays(): void {
    this.track(bindText(this.brightnessPercentage ?? null, computed(() => `${this._brightnessPercent.value}%`)));
    this.track(bindText(this.volumePercentage ?? null, computed(() => `${this._volumePercent.value}%`)));
    this.track(bindClass(this.brightnessControl ?? null, CSSClasses.HIDDEN, this._performanceModeEnabled));
  }

  _loadCurrentBrightness(): void {
    if (!this.brightnessSlider) return;

    this.currentBrightness = this.settingsService.getNumberSetting('globalBrightness');
    this.brightnessSlider.value = String(brightnessToSlider(this.currentBrightness));
    this._updateBrightnessDisplay();
  }

  _loadCurrentVolume(): void {
    if (!this.volumeSlider) return;

    this.currentVolume = this.settingsService.getNumberSetting('gameVolume');
    this.volumeSlider.value = String(this.currentVolume);
    this._updateVolumeDisplay();
    this._applyVolumeToVideo();
  }

  _loadPerformanceModeState(): void {
    this._performanceModeEnabled.value = this.settingsService.getBooleanSetting('performanceMode');
  }

  _setupBrightnessSlider(): void {
    if (!this.brightnessSlider) return;

    this.listen(this.brightnessSlider, 'input', () => {
      this._handleBrightnessChange(false);
    });

    this.listen(this.brightnessSlider, 'change', () => {
      this._handleBrightnessChange(true);
    });
  }

  _setupVolumeSlider(): void {
    if (!this.volumeSlider) return;

    this.listen(this.volumeSlider, 'input', () => {
      this._handleVolumeChange(false);
    });

    this.listen(this.volumeSlider, 'change', () => {
      this._handleVolumeChange(true);
    });
  }

  _subscribeToEvents(): void {
    this.trackSubscription(this.eventBus.subscribe(
      EventChannels.SETTINGS.BRIGHTNESS_CHANGED,
      (brightness) => {
        if (!this.brightnessSlider) return;
        if (Math.abs(brightness - this.currentBrightness) > 0.01) {
          this.currentBrightness = brightness;
          this.brightnessSlider.value = String(brightnessToSlider(brightness));
          this._updateBrightnessDisplay();
        }
      }
    ));

    this.trackSubscription(this.eventBus.subscribe(
      EventChannels.SETTINGS.VOLUME_CHANGED,
      (volume) => {
        if (!this.volumeSlider) return;
        if (Math.abs(volume - this.currentVolume) > 0.5) {
          this.currentVolume = volume;
          this.volumeSlider.value = String(volume);
          this._updateVolumeDisplay();
          this._applyVolumeToVideo();
        }
      }
    ));

    this.trackSubscription(this.eventBus.subscribe(
      EventChannels.PERFORMANCE.RENDER_MODE_CHANGED,
      (enabled) => {
        this._performanceModeEnabled.value = enabled;
      }
    ));
  }

  _handleBrightnessChange(saveToSettings: boolean): void {
    if (!this.brightnessSlider) return;

    const sliderValue = parseInt(this.brightnessSlider.value, 10);
    const brightness = sliderToBrightness(sliderValue);

    this.currentBrightness = brightness;
    this._updateBrightnessDisplay();

    if (saveToSettings) {
      this.settingsService.setSetting('globalBrightness', brightness);
    } else {
      this.eventBus.publish(EventChannels.SETTINGS.BRIGHTNESS_CHANGED, brightness);
    }
  }

  _updateBrightnessDisplay(): void {
    const sliderValue = this.brightnessSlider ? parseInt(this.brightnessSlider.value, 10) : 50;
    this._brightnessPercent.value = sliderValue;

    if (this.brightnessSlider) {
      this.brightnessSlider.style.setProperty('--fill-percent', this._fillPosition(sliderValue, this.brightnessSlider));
    }
  }

  _handleVolumeChange(saveToSettings: boolean): void {
    if (!this.volumeSlider) return;

    const sliderValue = parseInt(this.volumeSlider.value, 10);
    this.currentVolume = sliderValue;
    this._updateVolumeDisplay();
    this._applyVolumeToVideo();

    if (saveToSettings) {
      this.settingsService.setSetting('gameVolume', sliderValue);
    } else {
      this.eventBus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, sliderValue);
    }
  }

  _updateVolumeDisplay(): void {
    const sliderValue = this.volumeSlider ? parseInt(this.volumeSlider.value, 10) : 70;
    this._volumePercent.value = sliderValue;

    if (this.volumeSlider) {
      this.volumeSlider.style.setProperty('--fill-percent', this._fillPosition(sliderValue, this.volumeSlider));
    }
  }

  _fillPosition(sliderValue: number, slider: HTMLInputElement): string {
    const normalizedValue = sliderValue / 100;
    const thumbSize = 21;
    const thumbRadius = thumbSize / 2;
    const trackHeight = slider.offsetHeight || 120;
    const travelDistance = trackHeight - thumbSize;
    const thumbCenter = thumbRadius + normalizedValue * travelDistance;
    return `${thumbCenter}px`;
  }

  _applyVolumeToVideo(): void {
    if (this.streamVideo) {
      this.streamVideo.volume = this.currentVolume / 100;
    }
  }

  override dispose(): void | Promise<void> {
    const disposed = super.dispose();
    this.brightnessSlider = null;
    this.brightnessPercentage = null;
    this.brightnessControl = null;
    this.volumeSlider = null;
    this.volumePercentage = null;
    this.streamVideo = null;
    return disposed;
  }
}

export { ShaderSliderControlsComponent };
