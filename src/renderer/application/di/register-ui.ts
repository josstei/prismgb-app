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
import {
  defineRendererDescriptors,
  registerRendererDescriptors
} from '@renderer/infrastructure/di/renderer-container.factory.js';
import type { RegistrableContainer } from './registrable-container.type';
import type { RendererContainerMap } from './renderer-container-map.type';

const rendererUiDescriptors = defineRendererDescriptors<RendererContainerMap>([
  {
    token: 'settingsService',
    kind: 'class',
    resolver: SettingsService
  },
  {
    token: 'notesService',
    kind: 'class',
    resolver: NotesService
  },
  {
    token: 'updateService',
    kind: 'class',
    resolver: UpdateService
  },
  {
    token: 'updateUiService',
    kind: 'class',
    resolver: UpdateUiService
  },
  {
    token: 'streamViewService',
    kind: 'class',
    resolver: StreamingViewService
  },
  {
    token: 'streamingAudioPipelineService',
    kind: 'class',
    resolver: StreamingAudioPipelineService
  },
  {
    token: 'appState',
    kind: 'class',
    resolver: AppState
  },
  {
    token: 'uiComponentRegistry',
    kind: 'function',
    dependencies: ['loggerFactory'],
    resolver: (dependencies: any) => {
      const loggerFactory = dependencies.loggerFactory;
      const componentDefinitions = [
        {
          id: 'statusNotificationComponent',
          stage: 'core',
          create: (context: any) => {
            const { elements } = context as any;
            return new StatusNotificationComponent({
              statusMessage: elements.statusMessage
            });
          }
        },
        {
          id: 'deviceStatusComponent',
          stage: 'core',
          create: (context: any) => {
            const { elements } = context as any;
            return new DeviceStatusComponent({
              statusIndicator: elements.statusIndicator,
              statusText: elements.statusText,
              deviceName: elements.deviceName,
              deviceStatusText: elements.deviceStatusText,
              streamOverlay: elements.streamOverlay,
              overlayMessage: elements.overlayMessage
            });
          }
        },
        {
          id: 'streamControlsComponent',
          stage: 'core',
          create: (context: any) => {
            const { elements, dependencies } = context as any;
            return new StreamingControlsComponent({
              elements: {
                currentResolution: elements.currentResolution,
                currentFPS: elements.currentFPS,
                screenshotBtn: elements.screenshotBtn,
                recordBtn: elements.recordBtn,
                shaderControls: elements.shaderControls,
                streamOverlay: elements.streamOverlay
              },
              bodyClassManager: dependencies.bodyClassManager
            });
          }
        },
        {
          id: 'transcodeToastComponent',
          stage: 'core',
          create: (context: any) => {
            const { elements } = context as any;
            return new TranscodeToastComponent({
              recordBtn: elements.recordBtn,
              transcodeRing: elements.transcodeRing,
              transcodePercentLabel: elements.transcodePercentLabel
            });
          }
        },
        {
          id: 'settingsMenuComponent',
          stage: 'deferred',
          create: (context: any) => {
            const dependencies = context.dependencies as any;
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
          create: (context: any) => {
            const dependencies = context.dependencies as any;
            return new ShaderSelectorComponent({
              settingsService: dependencies.settingsService,
              appState: dependencies.appState,
              eventBus: dependencies.eventBus,
              logger: dependencies.logger
            });
          }
        },
        {
          id: 'notesPanelComponent',
          stage: 'deferred',
          create: (context: any) => {
            const dependencies = context.dependencies as any;
            return new NotesPanelComponent({
              notesService: dependencies.notesService,
              eventBus: dependencies.eventBus,
              logger: dependencies.logger
            });
          }
        }
      ];

      return new UIComponentRegistry({ componentDefinitions, loggerFactory });
    }
  },
  {
    token: 'uiEffects',
    kind: 'class',
    resolver: UIEffects,
    dependencies: ['bodyClassManager']
  },
  {
    token: 'bodyClassManager',
    kind: 'class',
    resolver: BodyClassManager
  },
  {
    token: 'uiEventBridge',
    kind: 'class',
    resolver: UIEventBridge
  },
  {
    token: 'presentationModeService',
    kind: 'class',
    resolver: PresentationModeService
  },
  {
    token: 'captureUiBridge',
    kind: 'class',
    resolver: CaptureUIBridge
  },
  {
    token: 'transcodeUiBridge',
    kind: 'class',
    resolver: TranscodeUIBridge
  }
]);

export function registerUi(container: RegistrableContainer<RendererContainerMap>): void {
  registerRendererDescriptors(container, rendererUiDescriptors);
}
