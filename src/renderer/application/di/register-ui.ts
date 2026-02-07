import { AppState } from '@renderer/application/state/app-state';
import { SettingsService } from '@renderer/infrastructure/services/settings/settings.service';
import { NotesService } from '@renderer/infrastructure/services/notes/notes.service';
import { UpdateService } from '@renderer/infrastructure/services/updates/update.service';
import { UpdateUiService } from '@renderer/infrastructure/services/updates/update-ui.service';
import { StreamingViewService } from '@renderer/infrastructure/services/streaming/streaming-view.service';
import { StreamingAudioPipelineService } from '@renderer/infrastructure/services/streaming/audio-pipeline.service';
import { UIComponentRegistry } from '@renderer/presentation/controller/component.registry.js';
import { StreamingControlsComponent } from '@renderer/presentation/features/streaming/streaming-controls.component.js';
import { ShaderSelectorComponent } from '@renderer/presentation/features/toolbar/components/shader-selector.component.js';
import { StatusNotificationComponent } from '@renderer/presentation/shared/status-notification.component.js';
import { DeviceStatusComponent } from '@renderer/presentation/shared/device-status.component.js';
import { TranscodeToastComponent } from '@renderer/presentation/features/transcode/transcode-toast.component.js';
import { UpdateSectionComponent } from '@renderer/presentation/features/updates/update-section.component.js';
import { SettingsMenuComponent } from '@renderer/presentation/features/settings/settings-menu.component.js';
import { NotesPanelComponent } from '@renderer/presentation/features/notes/notes-panel.component.js';
import { UIEffects } from '@renderer/presentation/effects/ui-effects.class';
import { BodyClassManager } from '@renderer/presentation/effects/body-class.class';
import { UIEventBridge } from '@renderer/presentation/bridges/ui-event.bridge';
import { PresentationModeService } from '@renderer/infrastructure/services/settings/presentation-mode.service';
import { CaptureUIBridge } from '@renderer/presentation/bridges/capture-ui.bridge';
import { TranscodeUIBridge } from '@renderer/presentation/bridges/transcode-ui.bridge';
import type { RegistrableContainer } from './registrable-container.type';
import type { RendererContainerMap } from './renderer-container-map.type';

export function registerUi(container: RegistrableContainer<RendererContainerMap>): void {
  container.registerSingleton(
    'settingsService',
    function (eventBus, loggerFactory, storageService) {
      return new SettingsService({ eventBus, loggerFactory, storageService });
    },
    ['eventBus', 'loggerFactory', 'storageService']
  );

  container.registerSingleton(
    'notesService',
    function (eventBus, loggerFactory, storageService) {
      return new NotesService({ eventBus, loggerFactory, storageService });
    },
    ['eventBus', 'loggerFactory', 'storageService']
  );

  container.registerSingleton(
    'updateService',
    function (eventBus, loggerFactory) {
      return new UpdateService({ eventBus, loggerFactory });
    },
    ['eventBus', 'loggerFactory']
  );

  container.registerSingleton(
    'updateUiService',
    function (eventBus, loggerFactory) {
      return new UpdateUiService({ eventBus, loggerFactory });
    },
    ['eventBus', 'loggerFactory']
  );

  container.registerSingleton(
    'streamViewService',
    function (uiController, loggerFactory) {
      return new StreamingViewService({ uiController, loggerFactory });
    },
    ['uiController', 'loggerFactory']
  );

  container.registerSingleton(
    'streamingAudioPipelineService',
    function (eventBus, loggerFactory, settingsService) {
      return new StreamingAudioPipelineService({ eventBus, loggerFactory, settingsService });
    },
    ['eventBus', 'loggerFactory', 'settingsService']
  );

  container.registerSingleton('appState', function(streamingService, deviceService, eventBus) {
    return new AppState({ streamingService, deviceService, eventBus });
  }, ['streamingService', 'deviceService', 'eventBus']);

  container.registerSingleton(
    'uiComponentRegistry',
    function (loggerFactory) {
      const componentDefinitions = [
        {
          id: 'statusNotificationComponent',
          stage: 'core',
          create: ({ elements }) => new StatusNotificationComponent({
            statusMessage: elements.statusMessage
          })
        },
        {
          id: 'deviceStatusComponent',
          stage: 'core',
          create: ({ elements }) => new DeviceStatusComponent({
            statusIndicator: elements.statusIndicator,
            statusText: elements.statusText,
            deviceName: elements.deviceName,
            deviceStatusText: elements.deviceStatusText,
            streamOverlay: elements.streamOverlay,
            overlayMessage: elements.overlayMessage
          })
        },
        {
          id: 'streamControlsComponent',
          stage: 'core',
          create: ({ elements, dependencies }) => new StreamingControlsComponent({
            elements: {
              currentResolution: elements.currentResolution,
              currentFPS: elements.currentFPS,
              screenshotBtn: elements.screenshotBtn,
              recordBtn: elements.recordBtn,
              shaderControls: elements.shaderControls,
              streamOverlay: elements.streamOverlay
            },
            bodyClassManager: dependencies.bodyClassManager
          })
        },
        {
          id: 'transcodeToastComponent',
          stage: 'core',
          create: ({ elements }) => new TranscodeToastComponent({
            recordBtn: elements.recordBtn,
            transcodeRing: elements.transcodeRing,
            transcodePercentLabel: elements.transcodePercentLabel
          })
        },
        {
          id: 'settingsMenuComponent',
          stage: 'deferred',
          create: ({ dependencies }) => {
            const updateSectionComponent = dependencies.updateOrchestrator
              ? new UpdateSectionComponent({
                updateOrchestrator: dependencies.updateOrchestrator,
                eventBus: dependencies.eventBus,
                loggerFactory: dependencies.loggerFactory
              })
              : null;

            return new SettingsMenuComponent({
              settingsService: dependencies.settingsService,
              updateSectionComponent,
              eventBus: dependencies.eventBus,
              loggerFactory: dependencies.loggerFactory,
              logger: dependencies.logger
            });
          }
        },
        {
          id: 'shaderSelectorComponent',
          stage: 'deferred',
          create: ({ dependencies }) => new ShaderSelectorComponent({
            settingsService: dependencies.settingsService,
            appState: dependencies.appState,
            eventBus: dependencies.eventBus,
            logger: dependencies.logger
          })
        },
        {
          id: 'notesPanelComponent',
          stage: 'deferred',
          create: ({ dependencies }) => new NotesPanelComponent({
            notesService: dependencies.notesService,
            eventBus: dependencies.eventBus,
            logger: dependencies.logger
          })
        }
      ];

      return new UIComponentRegistry({ componentDefinitions, loggerFactory });
    },
    ['loggerFactory']
  );

  container.registerSingleton(
    'uiEffects',
    function (bodyClassManager) {
      return new UIEffects({ elements: null, bodyClassManager });
    },
    ['bodyClassManager']
  );

  container.registerSingleton(
    'bodyClassManager',
    function () {
      return new BodyClassManager();
    },
    []
  );

  container.registerSingleton(
    'uiEventBridge',
    function (eventBus, uiController, presentationModeService, loggerFactory) {
      return new UIEventBridge({ eventBus, uiController, presentationModeService, loggerFactory });
    },
    ['eventBus', 'uiController', 'presentationModeService', 'loggerFactory']
  );

  container.registerSingleton(
    'presentationModeService',
    function (uiController, appState, loggerFactory) {
      return new PresentationModeService({ uiController, appState, loggerFactory });
    },
    ['uiController', 'appState', 'loggerFactory']
  );

  container.registerSingleton(
    'captureUiBridge',
    function (eventBus, uiController, loggerFactory) {
      return new CaptureUIBridge({ eventBus, uiController, loggerFactory });
    },
    ['eventBus', 'uiController', 'loggerFactory']
  );

  container.registerSingleton(
    'transcodeUiBridge',
    function (eventBus, uiController, loggerFactory) {
      return new TranscodeUIBridge({ eventBus, uiController, loggerFactory });
    },
    ['eventBus', 'uiController', 'loggerFactory']
  );
}
