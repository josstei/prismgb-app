import { ContainerModule } from 'inversify';
import { BodyClassManager } from '../../presentation/effects/body-class.effect';
import { CaptureUIBridge } from '../../presentation/bridges/capture-ui.bridge';
import { TranscodeUIBridge } from '../../presentation/bridges/transcode-ui.bridge';
import { UIEventBridge } from '../../presentation/bridges/ui-event.bridge';
import { UIEffects } from '../../presentation/effects/ui-effects.host';
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
import { TOKENS } from './tokens';

/**
 * Components, stores, effects and bridges. The UI components share the lazily
 * resolved `domBindings`; `uiComponentHost` binds in container.ts.
 */
export const presentationModule = new ContainerModule(({ bind }) => {
  bind(TOKENS.bodyClassManager).to(BodyClassManager);
  bind(TOKENS.captureUiBridge).to(CaptureUIBridge);
  bind(TOKENS.transcodeUiBridge).to(TranscodeUIBridge);
  bind(TOKENS.uiEventBridge).to(UIEventBridge);

  bind(TOKENS.uiEffects).toDynamicValue((ctx) => new UIEffects({
    bodyClassManager: ctx.get(TOKENS.bodyClassManager)
  }));

  bind(TOKENS.presentationModeStore).toDynamicValue((ctx) => new PresentationModeStore({
    eventBus: ctx.get(TOKENS.eventBus),
    cinematicEnabled: ctx.get(TOKENS.appState).cinematicModeSignal
  }));

  bind(TOKENS.domBindings).toDynamicValue(() => createDomBindings(document));

  bind(TOKENS.statusNotificationComponent).toDynamicValue((ctx) => new StatusNotificationComponent({
    elements: createTemplateComponentElements('statusNotificationComponent', ctx.get(TOKENS.domBindings)),
    store: new StatusNotificationStore({
      eventBus: ctx.get(TOKENS.eventBus)
    })
  }));

  bind(TOKENS.deviceStatusComponent).toDynamicValue((ctx) => new DeviceStatusComponent({
    elements: createTemplateComponentElements('deviceStatusComponent', ctx.get(TOKENS.domBindings)),
    store: new DeviceStatusStore({
      eventBus: ctx.get(TOKENS.eventBus),
      deviceConnectedSignal: ctx.get(TOKENS.appState).deviceConnectedSignal
    })
  }));

  bind(TOKENS.streamControlsComponent).toDynamicValue((ctx) => new StreamingControlsComponent({
    elements: createTemplateComponentElements('streamControlsComponent', ctx.get(TOKENS.domBindings)),
    bodyClassManager: ctx.get(TOKENS.bodyClassManager),
    store: new StreamInfoStore({ eventBus: ctx.get(TOKENS.eventBus) })
  }));

  bind(TOKENS.transcodeToastComponent).toDynamicValue((ctx) => new TranscodeToastComponent({
    elements: createTemplateComponentElements('transcodeToastComponent', ctx.get(TOKENS.domBindings)),
    store: new TranscodeProgressStore({ eventBus: ctx.get(TOKENS.eventBus) })
  }));

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
  });

  bind(TOKENS.shaderSelectorComponent).toDynamicValue((ctx) => {
    const component = new ShaderSelectorComponent({
      settingsService: ctx.get(TOKENS.settingsService),
      appState: ctx.get(TOKENS.appState),
      eventBus: ctx.get(TOKENS.eventBus),
      logger: ctx.get(TOKENS.loggerFactory).create('ShaderSelectorComponent')
    });
    component.initialize(createTemplateComponentElements('shaderSelectorComponent', ctx.get(TOKENS.domBindings)));
    return component;
  });

  bind(TOKENS.notesPanelComponent).toDynamicValue((ctx) => {
    const component = new NotesPanelComponent({
      notesService: ctx.get(TOKENS.notesService),
      logger: ctx.get(TOKENS.loggerFactory).create('NotesPanelComponent')
    });
    component.initialize(createTemplateComponentElements('notesPanelComponent', ctx.get(TOKENS.domBindings)));
    return component;
  });
});
