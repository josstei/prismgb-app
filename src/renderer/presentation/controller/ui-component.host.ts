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

export type UiComponentTokenResolver = <TInstance>(token: unknown) => TInstance;

type UiComponentTokenMap<TComponentMap> = Readonly<Record<keyof TComponentMap, unknown>>;

interface DisposableComponent {
  dispose(): void | Promise<void>;
}

function hasDisposer(component: unknown): component is DisposableComponent {
  return (
    typeof component === 'object' &&
    component !== null &&
    typeof (component as DisposableComponent).dispose === 'function'
  );
}

/**
 * Lazily resolves and caches UI components by id through an injected,
 * framework-agnostic resolver, tracking resolution order so `dispose()` can
 * unwind components in the reverse order they were constructed.
 */
export class UiComponentHost<TComponentMap extends object> {
  private readonly _resolved = new Map<keyof TComponentMap, TComponentMap[keyof TComponentMap]>();
  private readonly _resolutionOrder: (keyof TComponentMap)[] = [];
  private readonly _logger: LoggerLike | undefined;

  constructor(
    private readonly _resolve: UiComponentTokenResolver,
    private readonly _coreTokens: Partial<UiComponentTokenMap<TComponentMap>>,
    private readonly _allTokens: UiComponentTokenMap<TComponentMap>,
    loggerFactory?: LoggerFactoryLike | null
  ) {
    this._logger = loggerFactory?.create('UiComponentHost');
  }

  get<TId extends keyof TComponentMap>(id: TId): TComponentMap[TId] {
    if (!this._resolved.has(id)) {
      this._resolved.set(id, this._resolve<TComponentMap[TId]>(this._allTokens[id]));
      this._resolutionOrder.push(id);
    }
    return this._resolved.get(id) as TComponentMap[TId];
  }

  touchCore(): void {
    (Object.keys(this._coreTokens) as (keyof TComponentMap)[]).forEach((id) => this.get(id));
  }

  resolvedIds(): readonly string[] {
    return this._resolutionOrder.map(String);
  }

  async dispose(): Promise<void> {
    for (const id of [...this._resolutionOrder].reverse()) {
      const component = this._resolved.get(id);
      if (hasDisposer(component)) {
        try {
          await component.dispose();
        } catch (error) {
          this._logger?.error(`Error disposing component: ${String(id)}`, error);
        }
      }
    }

    this._resolved.clear();
    this._resolutionOrder.length = 0;
  }
}
