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
import type {
  RendererUiComponentCatalog,
  RendererUiComponentDefinitionUnion
} from '@renderer/presentation/controller/ui-component.catalog.js';
import { defineRendererUiComponent } from '@renderer/presentation/controller/ui-component.catalog.js';
import type { RegistrableContainer } from './registrable-container.type';
import type { RendererContainerMap } from './renderer-container-map.type';

function requireDependency<TDependencies extends object, TKey extends keyof TDependencies & string>(
  componentId: string,
  dependencies: Partial<TDependencies>,
  key: TKey
): NonNullable<TDependencies[TKey]> {
  const value = dependencies[key];
  if (value === undefined || value === null) {
    throw new Error(`${componentId}: missing UI component dependency "${key}"`);
  }
  return value as NonNullable<TDependencies[TKey]>;
}

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
    resolver: ({ loggerFactory }: Pick<RendererContainerMap, 'loggerFactory'>) => {
      const componentDefinitions: readonly RendererUiComponentDefinitionUnion[] = [
        defineRendererUiComponent({
          id: 'statusNotificationComponent',
          stage: 'core',
          create: (context) => {
            const elements = context.elements ?? {};
            return new StatusNotificationComponent({
              statusMessage: elements.statusMessage
            });
          }
        }),
        defineRendererUiComponent({
          id: 'deviceStatusComponent',
          stage: 'core',
          create: (context) => {
            const elements = context.elements ?? {};
            return new DeviceStatusComponent({
              statusIndicator: elements.statusIndicator,
              statusText: elements.statusText,
              deviceName: elements.deviceName,
              deviceStatusText: elements.deviceStatusText,
              streamOverlay: elements.streamOverlay,
              overlayMessage: elements.overlayMessage
            });
          }
        }),
        defineRendererUiComponent({
          id: 'streamControlsComponent',
          stage: 'core',
          create: (context) => {
            const elements = context.elements ?? {};
            const dependencies = context.dependencies ?? {};
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
        }),
        defineRendererUiComponent({
          id: 'transcodeToastComponent',
          stage: 'core',
          create: (context) => {
            const elements = context.elements ?? {};
            return new TranscodeToastComponent({
              recordBtn: elements.recordBtn,
              transcodeRing: elements.transcodeRing,
              transcodePercentLabel: elements.transcodePercentLabel
            });
          }
        }),
        defineRendererUiComponent({
          id: 'settingsMenuComponent',
          stage: 'deferred',
          create: (context) => {
            const dependencies = context.dependencies ?? {};
            const eventBus = requireDependency('settingsMenuComponent', dependencies, 'eventBus');
            const loggerFactory = requireDependency('settingsMenuComponent', dependencies, 'loggerFactory');
            const updateSectionComponent = dependencies.updateOrchestrator
              ? new UpdateSectionComponent({
                updateOrchestrator: dependencies.updateOrchestrator,
                eventBus,
                loggerFactory
              })
              : null;

            return new SettingsMenuComponent({
              settingsService: requireDependency('settingsMenuComponent', dependencies, 'settingsService'),
              updateSectionComponent,
              logger: dependencies.logger
            });
          }
        }),
        defineRendererUiComponent({
          id: 'shaderSelectorComponent',
          stage: 'deferred',
          create: (context) => {
            const dependencies = context.dependencies ?? {};
            return new ShaderSelectorComponent({
              settingsService: requireDependency('shaderSelectorComponent', dependencies, 'settingsService'),
              appState: dependencies.appState,
              eventBus: requireDependency('shaderSelectorComponent', dependencies, 'eventBus'),
              logger: dependencies.logger
            });
          }
        }),
        defineRendererUiComponent({
          id: 'notesPanelComponent',
          stage: 'deferred',
          create: (context) => {
            const dependencies = context.dependencies ?? {};
            return new NotesPanelComponent({
              notesService: requireDependency('notesPanelComponent', dependencies, 'notesService'),
              eventBus: requireDependency('notesPanelComponent', dependencies, 'eventBus'),
              logger: dependencies.logger
            });
          }
        })
      ];

      return new UIComponentRegistry<RendererUiComponentCatalog>({ componentDefinitions, loggerFactory });
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
