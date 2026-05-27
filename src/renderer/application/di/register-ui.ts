import { AppState } from '@renderer/application/state/app-state';
import { SettingsService } from '@renderer/infrastructure/services/settings/settings.service';
import { NotesService } from '@renderer/infrastructure/services/notes/notes.service';
import { UpdateService } from '@renderer/infrastructure/services/updates/update.service';
import { UpdateUiService } from '@renderer/infrastructure/services/updates/update-ui.service';
import { StreamingViewService } from '@renderer/infrastructure/services/streaming/streaming-view.service';
import { StreamingAudioPipelineService } from '@renderer/infrastructure/services/streaming/audio-pipeline.service';
import { UIComponentRegistry } from '@renderer/presentation/controller/component.registry.js';
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
  RendererUiComponentCatalog
} from '@renderer/presentation/controller/ui-component.catalog.js';
import { rendererUiComponentDefinitions } from '@renderer/presentation/controller/ui-component.catalog.js';
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
    resolver: ({ loggerFactory }: Pick<RendererContainerMap, 'loggerFactory'>) => new UIComponentRegistry<RendererUiComponentCatalog>({
      componentDefinitions: rendererUiComponentDefinitions,
      loggerFactory
    })
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
], { disposal: 'dispose' });

export function registerUi(container: RegistrableContainer<RendererContainerMap>): void {
  registerRendererDescriptors(container, rendererUiDescriptors);
}
