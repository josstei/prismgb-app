import { ContainerModule } from 'inversify';
import { BodyClassEffect } from '../../presentation/effects/body-class.effect';
import { AutoHideEffect } from '../../presentation/effects/auto-hide.effect';
import { FeedbackEffect } from '../../presentation/effects/feedback.effect';
import { UiEventBridge } from '../../presentation/bridges/ui-event.bridge';
import { PresentationModeStore } from '../../presentation/effects/presentation-mode.store';
import { createDomBindings } from '../../presentation/primitives/dom-bindings.utils';
import { StatusNotificationComponent } from '../../presentation/shell/status-notification.component';
import { StatusNotificationStore } from '../../presentation/shell/status-notification.store';
import { DeviceStatusComponent } from '../../presentation/shell/device-status.component';
import { DeviceStatusStore } from '../../presentation/shell/device-status.store';
import { StreamingControlsComponent } from '../../presentation/features/streaming/streaming-controls.component';
import { StreamInfoStore } from '../../presentation/features/streaming/stream-info.store';
import { TranscodeProgressComponent } from '../../presentation/features/toolbar/transcode-progress.component';
import { TranscodeProgressStore } from '../../presentation/features/toolbar/transcode-progress.store';
import { SettingsMenuComponent } from '../../presentation/features/settings/settings-menu.component';
import { UpdateSectionComponent } from '../../presentation/features/updates/update-section.component';
import { ShaderSelectorComponent } from '../../presentation/features/toolbar/shader-selector.component';
import { NotesPanelComponent } from '../../presentation/features/notes/notes-panel.component';
import { TOKENS } from './tokens';

/**
 * Components, stores, effects and the event bridge. The UI components share the
 * lazily resolved `domBindings`; `uiComponentHost` binds in container.ts.
 */
export const presentationModule = new ContainerModule(({ bind }) => {
  bind(TOKENS.uiEventBridge).to(UiEventBridge);
  bind(TOKENS.autoHideEffect).to(AutoHideEffect);
  bind(TOKENS.feedbackEffect).toDynamicValue((ctx) => new FeedbackEffect(ctx.get(TOKENS.domBindings).streaming));
  bind(TOKENS.bodyClassEffect).toDynamicValue((ctx) => new BodyClassEffect(new PresentationModeStore({
    eventBus: ctx.get(TOKENS.eventBus),
    cinematicEnabled: ctx.get(TOKENS.appState).cinematicModeSignal
  })));

  bind(TOKENS.domBindings).toDynamicValue(() => createDomBindings());

  bind(TOKENS.statusNotificationComponent).toDynamicValue((ctx) => new StatusNotificationComponent({
    elements: { statusMessage: ctx.get(TOKENS.domBindings).shell.statusMessage },
    store: new StatusNotificationStore({ eventBus: ctx.get(TOKENS.eventBus) })
  }));

  bind(TOKENS.deviceStatusComponent).toDynamicValue((ctx) => {
    const { shell, streaming } = ctx.get(TOKENS.domBindings);
    return new DeviceStatusComponent({
      elements: {
        statusIndicator: shell.statusIndicator,
        statusText: shell.statusText,
        deviceName: streaming.deviceName,
        deviceStatusText: streaming.deviceStatusText,
        streamOverlay: streaming.streamOverlay,
        overlayMessage: streaming.overlayMessage
      },
      store: new DeviceStatusStore({ eventBus: ctx.get(TOKENS.eventBus) })
    });
  });

  bind(TOKENS.streamingControlsComponent).toDynamicValue((ctx) => {
    const { streaming } = ctx.get(TOKENS.domBindings);
    return new StreamingControlsComponent({
      elements: {
        currentResolution: streaming.currentResolution,
        currentFPS: streaming.currentFPS,
        screenshotBtn: streaming.screenshotBtn,
        recordBtn: streaming.recordBtn,
        shaderControls: streaming.shaderControls,
        streamOverlay: streaming.streamOverlay
      },
      bodyClassEffect: ctx.get(TOKENS.bodyClassEffect),
      store: new StreamInfoStore({ eventBus: ctx.get(TOKENS.eventBus) })
    });
  });

  bind(TOKENS.transcodeProgressComponent).toDynamicValue((ctx) => {
    const { streaming } = ctx.get(TOKENS.domBindings);
    return new TranscodeProgressComponent({
      elements: {
        recordBtn: streaming.recordBtn,
        transcodeRing: streaming.transcodeRing,
        transcodePercentLabel: streaming.transcodePercentLabel
      },
      store: new TranscodeProgressStore({ eventBus: ctx.get(TOKENS.eventBus) })
    });
  });

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
    const { settings, updates } = ctx.get(TOKENS.domBindings);
    component.initialize({ ...settings, ...updates });
    return component;
  });

  bind(TOKENS.shaderSelectorComponent).toDynamicValue((ctx) => {
    const component = new ShaderSelectorComponent({
      settingsService: ctx.get(TOKENS.settingsService),
      appState: ctx.get(TOKENS.appState),
      eventBus: ctx.get(TOKENS.eventBus),
      logger: ctx.get(TOKENS.loggerFactory).create('ShaderSelectorComponent')
    });
    const { streaming } = ctx.get(TOKENS.domBindings);
    component.initialize({
      shaderBtn: streaming.shaderBtn,
      shaderDropdown: streaming.shaderDropdown,
      shaderOptions: streaming.shaderOptions,
      shaderUnavailableMessage: streaming.shaderUnavailableMessage,
      cinematicToggle: streaming.cinematicToggle,
      cinematicPillText: streaming.cinematicPillText,
      brightnessSlider: streaming.brightnessSlider,
      brightnessPercentage: streaming.brightnessPercentage,
      brightnessControl: streaming.brightnessControl,
      volumeSlider: streaming.volumeSliderVertical,
      volumePercentage: streaming.volumePercentageVertical,
      streamVideo: streaming.streamVideo
    });
    return component;
  });

  bind(TOKENS.notesPanelComponent).toDynamicValue((ctx) => {
    const component = new NotesPanelComponent({
      notesService: ctx.get(TOKENS.notesService),
      logger: ctx.get(TOKENS.loggerFactory).create('NotesPanelComponent')
    });
    const { notes, streaming } = ctx.get(TOKENS.domBindings);
    component.initialize({
      ...notes,
      streamContainer: streaming.streamContainer,
      streamToolbar: streaming.streamToolbar
    });
    return component;
  });
});
