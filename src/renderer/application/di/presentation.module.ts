import { ContainerModule } from 'inversify';
import { NotesService } from '@platform/notes';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import { PROTECTED_STORAGE_KEYS } from '@renderer/lib/storage-keys.config.js';
import { BodyClassManager } from '../../presentation/effects/body-class.effect';
import { CaptureUIBridge } from '../../presentation/bridges/capture-ui.bridge';
import { TranscodeUIBridge } from '../../presentation/bridges/transcode-ui.bridge';
import { UIEventBridge } from '../../presentation/bridges/ui-event.bridge';
import { UIEffects } from '../../presentation/effects/ui-effects.host';
import { AppState } from '../state/app-state';
import { PresentationModeStore } from '../../presentation/state/presentation-mode.store';
import { createDomBindings } from '../../presentation/primitives/dom-bindings.utils';
import { createTemplateComponentElements } from '../../presentation/primitives/template-dom.contract';
import { StatusNotificationComponent } from '../../presentation/shared/status-notification.component';
import { StatusNotificationStore } from '../../presentation/state/status-notification.store';
import { DeviceStatusComponent } from '../../presentation/shared/device-status.component';
import { DeviceStatusStore } from '../../presentation/state/device-status.store';
import { StreamingControlsComponent } from '../../presentation/features/streaming/streaming-controls.component';
import { StreamInfoStore } from '../../presentation/state/stream-info.store';
import { TranscodeToastComponent } from '../../presentation/features/transcode/transcode-toast.component';
import { TranscodeProgressStore } from '../../presentation/state/transcode-progress.store';
import { SettingsMenuComponent } from '../../presentation/features/settings/settings-menu.component';
import { UpdateSectionComponent } from '../../presentation/features/updates/update-section.component';
import { ShaderSelectorComponent } from '../../presentation/features/toolbar/shader-selector.component';
import { NotesPanelComponent } from '../../presentation/features/notes/notes-panel.component';
import { BrowserStorageAdapter } from '../../infrastructure/adapters/browser-storage.adapter';
import { BrowserMediaDevicesPort } from '../../infrastructure/services/devices/browser-media-devices.port';
import { StorageDevicePreferenceStore } from '../../infrastructure/services/devices/storage-device-preference.store';
import { TrpcDeviceStatusPort } from '../../infrastructure/services/devices/trpc-device-status.port';
import { TOKENS } from './tokens.js';

/**
 * Binding module for every renderer presentation-layer token: decorated
 * bridges/effects bind straight to their class; the non-standard-construction
 * tokens (platform storage/device ports, the seven UI components sharing a
 * lazily-resolved `domBindings` singleton) and the non-decorated
 * platform-adjacent classes (`NotesService`, `AppState`, `UIEffects`) bind
 * through factories that assemble their dependency objects explicitly.
 */
export const presentationModule = new ContainerModule(({ bind }) => {
  bind(TOKENS.bodyClassManager).to(BodyClassManager).inSingletonScope();
  bind(TOKENS.captureUiBridge).to(CaptureUIBridge).inSingletonScope();
  bind(TOKENS.transcodeUiBridge).to(TranscodeUIBridge).inSingletonScope();
  bind(TOKENS.uiEventBridge).to(UIEventBridge).inSingletonScope();

  bind(TOKENS.storageService).toDynamicValue(() =>
    new BrowserStorageAdapter({ protectedKeys: PROTECTED_STORAGE_KEYS })
  ).inSingletonScope();

  bind(TOKENS.deviceStatusPort).toDynamicValue((ctx) =>
    new TrpcDeviceStatusPort(
      trpcClient,
      ctx.get(TOKENS.loggerFactory).create('TrpcDeviceStatusPort')
    )
  ).inSingletonScope();

  bind(TOKENS.mediaDevicesPort).toDynamicValue((ctx) =>
    new BrowserMediaDevicesPort(
      ctx.get(TOKENS.browserMediaService),
      ctx.get(TOKENS.loggerFactory).create('BrowserMediaDevicesPort')
    )
  ).inSingletonScope();

  bind(TOKENS.devicePreferenceStore).toDynamicValue((ctx) =>
    new StorageDevicePreferenceStore(
      ctx.get(TOKENS.storageService),
      ctx.get(TOKENS.loggerFactory).create('StorageDevicePreferenceStore')
    )
  ).inSingletonScope();

  bind(TOKENS.presentationModeStore).toDynamicValue((ctx) =>
    new PresentationModeStore({
      eventBus: ctx.get(TOKENS.eventBus),
      cinematicEnabled: ctx.get(TOKENS.appState).cinematicModeSignal
    })
  ).inSingletonScope();

  bind(TOKENS.domBindings).toDynamicValue(() => createDomBindings(document)).inSingletonScope();

  bind(TOKENS.statusNotificationComponent).toDynamicValue((ctx) => new StatusNotificationComponent({
    elements: createTemplateComponentElements('statusNotificationComponent', ctx.get(TOKENS.domBindings)),
    store: new StatusNotificationStore({
      eventBus: ctx.get(TOKENS.eventBus)
    })
  })).inSingletonScope();

  bind(TOKENS.deviceStatusComponent).toDynamicValue((ctx) => new DeviceStatusComponent({
    elements: createTemplateComponentElements('deviceStatusComponent', ctx.get(TOKENS.domBindings)),
    store: new DeviceStatusStore({
      eventBus: ctx.get(TOKENS.eventBus),
      deviceConnectedSignal: ctx.get(TOKENS.appState).deviceConnectedSignal
    })
  })).inSingletonScope();

  bind(TOKENS.streamControlsComponent).toDynamicValue((ctx) => new StreamingControlsComponent({
    elements: createTemplateComponentElements('streamControlsComponent', ctx.get(TOKENS.domBindings)),
    bodyClassManager: ctx.get(TOKENS.bodyClassManager),
    store: new StreamInfoStore({ eventBus: ctx.get(TOKENS.eventBus) })
  })).inSingletonScope();

  bind(TOKENS.transcodeToastComponent).toDynamicValue((ctx) => new TranscodeToastComponent({
    elements: createTemplateComponentElements('transcodeToastComponent', ctx.get(TOKENS.domBindings)),
    store: new TranscodeProgressStore({ eventBus: ctx.get(TOKENS.eventBus) })
  })).inSingletonScope();

  bind(TOKENS.settingsMenuComponent).toDynamicValue((ctx) => {
    const eventBus = ctx.get(TOKENS.eventBus);
    const loggerFactory = ctx.get(TOKENS.loggerFactory);
    const updateService = ctx.get(TOKENS.updateService);
    const updateSectionComponent = updateService
      ? new UpdateSectionComponent({ updateService, eventBus, loggerFactory })
      : null;

    const component = new SettingsMenuComponent({
      settingsService: ctx.get(TOKENS.settingsService),
      updateSectionComponent,
      logger: loggerFactory.create('SettingsMenuComponent')
    });
    component.initialize(createTemplateComponentElements('settingsMenuComponent', ctx.get(TOKENS.domBindings)));
    return component;
  }).inSingletonScope();

  bind(TOKENS.shaderSelectorComponent).toDynamicValue((ctx) => {
    const component = new ShaderSelectorComponent({
      settingsService: ctx.get(TOKENS.settingsService),
      appState: ctx.get(TOKENS.appState),
      eventBus: ctx.get(TOKENS.eventBus),
      logger: ctx.get(TOKENS.loggerFactory).create('ShaderSelectorComponent')
    });
    component.initialize(createTemplateComponentElements('shaderSelectorComponent', ctx.get(TOKENS.domBindings)));
    return component;
  }).inSingletonScope();

  bind(TOKENS.notesPanelComponent).toDynamicValue((ctx) => {
    const component = new NotesPanelComponent({
      notesService: ctx.get(TOKENS.notesService),
      eventBus: ctx.get(TOKENS.eventBus),
      logger: ctx.get(TOKENS.loggerFactory).create('NotesPanelComponent')
    });
    component.initialize(createTemplateComponentElements('notesPanelComponent', ctx.get(TOKENS.domBindings)));
    return component;
  }).inSingletonScope();

  bind(TOKENS.notesService).toDynamicValue((ctx) => new NotesService({
    eventBus: ctx.get(TOKENS.eventBus),
    storageService: ctx.get(TOKENS.storageService),
    loggerFactory: ctx.get(TOKENS.loggerFactory)
  })).inSingletonScope();

  bind(TOKENS.appState).toDynamicValue((ctx) => new AppState({
    streamingService: ctx.get(TOKENS.streamingService),
    rendererDeviceRuntime: ctx.get(TOKENS.rendererDeviceRuntime),
    eventBus: ctx.get(TOKENS.eventBus)
  })).inSingletonScope();

  bind(TOKENS.uiEffects).toDynamicValue((ctx) => new UIEffects({
    bodyClassManager: ctx.get(TOKENS.bodyClassManager)
  })).inSingletonScope();
});
