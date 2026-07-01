import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { PresentationComponent, bindClass, computed } from '@prismgb/ui-base';
import { signal } from '@prismgb/ui-base/reactive';
import { getUiPresets, resolvePreset } from '@prismgb/gpu';
import { EventChannels } from '@prismgb/events';
import type { TypedEventBusLike } from '@prismgb/events';
import type { LoggerLike } from '@prismgb/core';

type UiShaderPreset = ReturnType<typeof getUiPresets>[number];
const presetOptionListenersKey = Symbol('shader-preset-option-listeners');

export interface ShaderPresetSettingsService {
  getStringSetting(name: string): string;
  getBooleanSetting(name: string): boolean;
  setSetting(name: string, value: unknown): boolean | Promise<boolean>;
}

export interface ShaderPresetListComponentOptions {
  settingsService: ShaderPresetSettingsService;
  eventBus: TypedEventBusLike;
  logger?: LoggerLike | null;
}

export interface ShaderPresetListElements {
  optionsContainer?: HTMLElement | null;
  unavailableMessage?: HTMLElement | null;
}

class ShaderPresetListComponent extends PresentationComponent {
  declare settingsService: ShaderPresetSettingsService;
  declare eventBus: TypedEventBusLike;
  declare logger: LoggerLike | null | undefined;
  declare optionsContainer: HTMLElement | null | undefined;
  declare unavailableMessage: HTMLElement | null | undefined;
  declare currentPresetId: string | null;

  private readonly _performanceModeEnabled = signal(false);

  constructor({ settingsService, eventBus, logger }: ShaderPresetListComponentOptions) {
    super();

    this.settingsService = settingsService;
    this.eventBus = eventBus;
    this.logger = logger;

    this.optionsContainer = null;
    this.unavailableMessage = null;

    this.currentPresetId = null;
  }

  initialize({ optionsContainer, unavailableMessage }: ShaderPresetListElements): void {
    void this.dispose();
    this.optionsContainer = optionsContainer;
    this.unavailableMessage = unavailableMessage;

    if (!this.optionsContainer || !this.unavailableMessage) {
      this.logger?.warn('Shader preset list elements not found');
      return;
    }

    this._loadCurrentPreset();
    this._loadPerformanceModeState();
    this._bindVisibility();
    this._renderPresetList();
    this._subscribeToEvents();

    this.logger?.debug('Shader preset list initialized');
  }

  _loadCurrentPreset(): void {
    this.currentPresetId = resolvePreset(this.settingsService.getStringSetting('renderPreset')).id;
  }

  _loadPerformanceModeState(): void {
    this._performanceModeEnabled.value = this.settingsService.getBooleanSetting('performanceMode');
  }

  _bindVisibility(): void {
    this.track(bindClass(this.optionsContainer ?? null, CSSClasses.HIDDEN, this._performanceModeEnabled));
    this.track(bindClass(
      this.unavailableMessage ?? null,
      CSSClasses.HIDDEN,
      computed(() => !this._performanceModeEnabled.value)
    ));
  }

  _renderPresetList(): void {
    const container = this.optionsContainer;
    if (!container) return;

    this.cancelManaged(presetOptionListenersKey);
    container.innerHTML = '';

    const presets = getUiPresets();
    const optionDisposers: Array<() => void> = [];
    presets.forEach((preset: UiShaderPreset) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'shader-option';
      option.dataset.presetId = preset.id;

      if (preset.id === this.currentPresetId) {
        option.classList.add(CSSClasses.ACTIVE);
      }

      option.innerHTML = `<span class="shader-option-name">${preset.name}</span>`;

      optionDisposers.push(this.listen(option, 'click', () => {
        if (!this._performanceModeEnabled.value) {
          this._selectPreset(preset.id);
        }
      }));

      container.appendChild(option);
    });
    this.replaceManaged(presetOptionListenersKey, () => optionDisposers.forEach((dispose) => dispose()));
  }

  _selectPreset(presetId: string): void {
    if (presetId === this.currentPresetId) {
      return;
    }

    this.currentPresetId = presetId;
    this.settingsService.setSetting('renderPreset', presetId);
    this._updateActiveState(true);

    this.logger?.debug(`Shader preset selected: ${presetId}`);
  }

  _updateActiveState(animate = false): void {
    const container = this.optionsContainer;
    if (!container) return;

    const options = container.querySelectorAll<HTMLButtonElement>('.shader-option');
    options.forEach((option) => {
      option.classList.remove(CSSClasses.JUST_SELECTED);

      if (option.dataset.presetId === this.currentPresetId) {
        option.classList.add(CSSClasses.ACTIVE);
        if (animate) {
          option.classList.add(CSSClasses.JUST_SELECTED);
        }
      } else {
        option.classList.remove(CSSClasses.ACTIVE);
      }
    });
  }

  _subscribeToEvents(): void {
    this.trackSubscription(this.eventBus.subscribe(
      EventChannels.SETTINGS.RENDER_PRESET_CHANGED,
      (presetId) => {
        if (presetId !== this.currentPresetId) {
          this.currentPresetId = presetId;
          this._updateActiveState();
        }
      }
    ));

    this.trackSubscription(this.eventBus.subscribe(
      EventChannels.PERFORMANCE.RENDER_MODE_CHANGED,
      (enabled) => {
        this._performanceModeEnabled.value = enabled;
        this.logger?.debug(`Performance mode ${enabled ? 'enabled' : 'disabled'} - shader options updated`);
      }
    ));
  }

  override dispose(): void | Promise<void> {
    const disposed = super.dispose();
    this.optionsContainer = null;
    this.unavailableMessage = null;
    return disposed;
  }
}

export { ShaderPresetListComponent };
