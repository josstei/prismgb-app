import type { LoggerFactoryLike } from '@platform/core';
import type { TypedEventBusLike } from '@platform/events';
import type { SettingsAccess } from '@renderer/lib/settings.definitions.js';
import type { DomBindings } from '../primitives/dom-bindings.utils.js';
import type { BodyClassManager } from '../effects/body-class.effect.js';
import { StatusNotificationComponent } from '../shared/status-notification.component.js';
import { StatusNotificationStore } from '../state/status-notification.store.js';
import { DeviceStatusComponent } from '../shared/device-status.component.js';
import { DeviceStatusStore } from '../state/device-status.store.js';
import { StreamingControlsComponent } from '../features/streaming/streaming-controls.component.js';
import { StreamInfoStore } from '../state/stream-info.store.js';
import { TranscodeToastComponent } from '../features/transcode/transcode-toast.component.js';
import { TranscodeProgressStore } from '../state/transcode-progress.store.js';
import { SettingsMenuComponent } from '../features/settings/settings-menu.component.js';
import { UpdateSectionComponent } from '../features/updates/update-section.component.js';
import { ShaderSelectorComponent } from '../features/toolbar/shader-selector.component.js';
import { NotesPanelComponent } from '../features/notes/notes-panel.component.js';

interface RendererUiDependencies {
  dom: DomBindings;
  eventBus: TypedEventBusLike;
  loggerFactory: LoggerFactoryLike;
  settingsService: SettingsAccess;
  notesService: ConstructorParameters<typeof NotesPanelComponent>[0]['notesService'];
  updateService: ConstructorParameters<typeof UpdateSectionComponent>[0]['updateService'];
  appState: ConstructorParameters<typeof ShaderSelectorComponent>[0]['appState'];
  bodyClassManager: BodyClassManager;
  initialDeviceConnected: boolean;
}

function component<T extends { dispose(): void | Promise<void> }>(
  deferred: boolean,
  create: () => T,
  mount?: (instance: T) => void
) {
  return {
    deferred,
    create(own: (instance: T) => T): T {
      // Own the instance before mounting so partial initialization is rolled back.
      const instance = own(create());
      mount?.(instance);
      return instance;
    }
  };
}

/** One registry owns component IDs, construction, mounting and startup phase. */
export function createRendererUiComponents({
  dom, eventBus, loggerFactory, settingsService, notesService, updateService,
  appState, bodyClassManager, initialDeviceConnected
}: RendererUiDependencies) {
  const elements = dom.flat;
  return {
    statusNotificationComponent: component(false, () => new StatusNotificationComponent({
      elements, store: new StatusNotificationStore({ eventBus })
    })),
    deviceStatusComponent: component(false, () => new DeviceStatusComponent({
      elements, store: new DeviceStatusStore({ eventBus, initialDeviceConnected })
    })),
    streamControlsComponent: component(false, () => new StreamingControlsComponent({
      elements, bodyClassManager, store: new StreamInfoStore({ eventBus })
    })),
    transcodeToastComponent: component(false, () => new TranscodeToastComponent({
      elements, store: new TranscodeProgressStore({ eventBus })
    })),
    settingsMenuComponent: component(true, () => new SettingsMenuComponent({
      settingsService,
      updateSectionComponent: new UpdateSectionComponent({ updateService, eventBus, loggerFactory }),
      logger: loggerFactory.create('SettingsMenuComponent')
    }), (instance) => instance.initialize(elements)),
    shaderSelectorComponent: component(true, () => new ShaderSelectorComponent({
      settingsService, appState, eventBus, logger: loggerFactory.create('ShaderSelectorComponent')
    }), (instance) => instance.initialize({
      ...elements,
      volumeSlider: elements.volumeSliderVertical,
      volumePercentage: elements.volumePercentageVertical
    })),
    notesPanelComponent: component(true, () => new NotesPanelComponent({
      notesService, eventBus, logger: loggerFactory.create('NotesPanelComponent')
    }), (instance) => instance.initialize(elements))
  };
}

type RendererUiComponents = ReturnType<typeof createRendererUiComponents>;
export type RendererUiComponentInstanceMap = {
  [TId in keyof RendererUiComponents]: ReturnType<RendererUiComponents[TId]['create']>;
};
