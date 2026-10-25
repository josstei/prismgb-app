import type { LoggerFactoryLike, LoggerLike } from '@platform/core';
import type { StatusNotificationComponent } from '@renderer/presentation/shared/status-notification.component.js';
import type { DeviceStatusComponent } from '@renderer/presentation/shared/device-status.component.js';
import type { StreamingControlsComponent } from '@renderer/presentation/features/streaming/streaming-controls.component.js';
import type { TranscodeToastComponent } from '@renderer/presentation/features/transcode/transcode-toast.component.js';
import type { SettingsMenuComponent } from '@renderer/presentation/features/settings/settings-menu.component.js';
import type { ShaderSelectorComponent } from '@renderer/presentation/features/toolbar/shader-selector.component.js';
import type { NotesPanelComponent } from '@renderer/presentation/features/notes/notes-panel.component.js';

export interface RendererUiComponentInstanceMap {
  statusNotificationComponent: StatusNotificationComponent;
  deviceStatusComponent: DeviceStatusComponent;
  streamControlsComponent: StreamingControlsComponent;
  transcodeToastComponent: TranscodeToastComponent;
  settingsMenuComponent: SettingsMenuComponent;
  shaderSelectorComponent: ShaderSelectorComponent;
  notesPanelComponent: NotesPanelComponent;
}

export type UiComponentFactories<TComponentMap> = {
  readonly [TId in keyof TComponentMap]: (own: (component: TComponentMap[TId]) => TComponentMap[TId]) => TComponentMap[TId];
};

interface DisposableComponent {
  dispose(): void | Promise<void>;
}

/**
 * Lazily creates and caches UI components from typed factories, tracking resolution order so `dispose()` can
 * unwind components in the reverse order they were constructed.
 */
export class UiComponentHost<TComponentMap extends { [TId in keyof TComponentMap]: DisposableComponent }> {
  private readonly _resolved = new Map<keyof TComponentMap, TComponentMap[keyof TComponentMap]>();
  private readonly _resolutionOrder: (keyof TComponentMap)[] = [];
  private readonly _logger: LoggerLike | undefined;
  private disposal: Promise<void> | null = null;

  constructor(
    private readonly factories: UiComponentFactories<TComponentMap>,
    private readonly coreIds: readonly (keyof TComponentMap)[],
    loggerFactory?: LoggerFactoryLike | null
  ) {
    this._logger = loggerFactory?.create('UiComponentHost');
  }

  get<TId extends keyof TComponentMap>(id: TId): TComponentMap[TId] {
    if (this.disposal) throw new Error('UI component host has been disposed');
    if (!this._resolved.has(id)) {
      // A factory can establish ownership before mounting so partial initialization rolls back.
      const own = (component: TComponentMap[TId]): TComponentMap[TId] => {
        if (!this._resolved.has(id)) {
          this._resolved.set(id, component);
          this._resolutionOrder.push(id);
        }
        return component;
      };
      own(this.factories[id](own));
    }
    return this._resolved.get(id) as TComponentMap[TId];
  }

  touchCore(): void {
    this.coreIds.forEach((id) => this.get(id));
  }

  dispose(): Promise<void> {
    return this.disposal ??= this.disposeComponents();
  }

  private async disposeComponents(): Promise<void> {
    const errors: unknown[] = [];
    for (const id of [...this._resolutionOrder].reverse()) {
      const component = this._resolved.get(id);
      if (component) {
        try {
          await component.dispose();
        } catch (error) {
          errors.push(error);
          this._logger?.error(`Error disposing component: ${String(id)}`, error);
        }
      }
    }

    this._resolved.clear();
    this._resolutionOrder.length = 0;
    if (errors.length > 0) throw new AggregateError(errors, 'UI component disposal failed');
  }
}
