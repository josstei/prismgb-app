import type {
  UIComponentContract,
  UIComponentDefinition,
  UIComponentDefinitionUnion,
  UIComponentDependencies,
  UIComponentElements,
  UIComponentId,
  UIComponentRegistryDependencies,
  UIComponentRegistryElements
} from '@renderer/presentation/controller/component.registry.js';
import type {
  StreamingControlsComponent,
  StreamingControlsComponentOptions,
  StreamingControlsElements
} from '@renderer/presentation/features/streaming/streaming-controls.component.js';
import type {
  ShaderSelectorComponent,
  ShaderSelectorComponentOptions,
  ShaderSelectorElements
} from '@renderer/presentation/features/toolbar/components/shader-selector.component.js';
import type {
  StatusNotificationComponent,
  StatusNotificationElements
} from '@renderer/presentation/shared/status-notification.component.js';
import type {
  DeviceStatusComponent,
  DeviceStatusElements
} from '@renderer/presentation/shared/device-status.component.js';
import type {
  TranscodeToastComponent,
  TranscodeToastElements
} from '@renderer/presentation/features/transcode/transcode-toast.component.js';
import type {
  UpdateSectionComponentOptions
} from '@renderer/presentation/features/updates/update-section.component.js';
import type {
  SettingsMenuComponent,
  SettingsMenuComponentOptions,
  SettingsMenuElements
} from '@renderer/presentation/features/settings/settings-menu.component.js';
import type {
  NotesPanelComponent,
  NotesPanelComponentOptions,
  NotesPanelElements
} from '@renderer/presentation/features/notes/notes-panel.component.js';

type NoComponentDependencies = object;

export type StreamingControlsComponentDependencies = Pick<
  StreamingControlsComponentOptions,
  'bodyClassManager'
>;

export type SettingsMenuComponentDependencies =
  Omit<SettingsMenuComponentOptions, 'updateSectionComponent'> & {
    eventBus: UpdateSectionComponentOptions['eventBus'];
    loggerFactory: NonNullable<UpdateSectionComponentOptions['loggerFactory']>;
    updateOrchestrator?: UpdateSectionComponentOptions['updateOrchestrator'] | null;
  };

export interface RendererUiComponentCatalog {
  statusNotificationComponent: UIComponentContract<
    StatusNotificationElements,
    NoComponentDependencies,
    StatusNotificationComponent
  >;
  deviceStatusComponent: UIComponentContract<
    DeviceStatusElements,
    NoComponentDependencies,
    DeviceStatusComponent
  >;
  streamControlsComponent: UIComponentContract<
    StreamingControlsElements,
    StreamingControlsComponentDependencies,
    StreamingControlsComponent
  >;
  transcodeToastComponent: UIComponentContract<
    TranscodeToastElements,
    NoComponentDependencies,
    TranscodeToastComponent
  >;
  settingsMenuComponent: UIComponentContract<
    SettingsMenuElements,
    SettingsMenuComponentDependencies,
    SettingsMenuComponent
  >;
  shaderSelectorComponent: UIComponentContract<
    ShaderSelectorElements,
    ShaderSelectorComponentOptions,
    ShaderSelectorComponent
  >;
  notesPanelComponent: UIComponentContract<
    NotesPanelElements,
    NotesPanelComponentOptions,
    NotesPanelComponent
  >;
}

export type RendererUiComponentId = UIComponentId<RendererUiComponentCatalog>;

export type RendererUiComponentElements<TId extends RendererUiComponentId> = UIComponentElements<
  RendererUiComponentCatalog,
  TId
>;

export type RendererUiComponentDependencies<TId extends RendererUiComponentId> = UIComponentDependencies<
  RendererUiComponentCatalog,
  TId
>;

export type RendererUiRegistryElements = UIComponentRegistryElements<RendererUiComponentCatalog>;

export type RendererUiRegistryDependencies = UIComponentRegistryDependencies<RendererUiComponentCatalog>;

export type RendererUiComponentDefinition<TId extends RendererUiComponentId = RendererUiComponentId> =
  UIComponentDefinition<RendererUiComponentCatalog, TId>;

export type RendererUiComponentDefinitionUnion =
  UIComponentDefinitionUnion<RendererUiComponentCatalog>;

export function defineRendererUiComponent<TId extends RendererUiComponentId>(
  definition: RendererUiComponentDefinition<TId>
): RendererUiComponentDefinition<TId> {
  return definition;
}
