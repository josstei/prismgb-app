import { AppState } from '@renderer/application/state/app-state';
import { SettingsService } from '@renderer/infrastructure/services/settings/settings.service';
import { NotesService } from '@renderer/infrastructure/services/notes/notes.service';
import { UpdateService } from '@renderer/infrastructure/services/updates/update.service';
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
import { UpdateUIBridge } from '@renderer/presentation/bridges/update-ui.bridge';
import type { RegistrableContainer } from './registrable-container.type';
import type { RendererContainerMap } from './renderer-container-map.type';

export function registerUi(container: RegistrableContainer<RendererContainerMap>): void {
  container.autoRegister('settingsService', SettingsService);
  container.autoRegister('notesService', NotesService);
  container.autoRegister('updateService', UpdateService);
  container.autoRegister('streamingAudioPipelineService', StreamingAudioPipelineService);
  container.autoRegister('appState', AppState);

  container.registerFactory(
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
            const updateSectionComponent = dependencies.updateService
              ? new UpdateSectionComponent({
                updateService: dependencies.updateService,
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

  container.registerFactory(
    'uiEffects',
    function (bodyClassManager) {
      return new UIEffects({ elements: null, bodyClassManager });
    },
    ['bodyClassManager']
  );

  container.registerFactory(
    'bodyClassManager',
    function () {
      return new BodyClassManager();
    },
    []
  );

  container.autoRegister('uiEventBridge', UIEventBridge);
  container.autoRegister('presentationModeService', PresentationModeService);
  container.autoRegister('captureUiBridge', CaptureUIBridge);
  container.autoRegister('updateUiBridge', UpdateUIBridge);
  container.autoRegister('transcodeUiBridge', TranscodeUIBridge);
}
