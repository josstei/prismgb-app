import {
  StreamingControlsComponent,
  type StreamingControlsComponentOptions
} from '@renderer/presentation/features/streaming/streaming-controls.component.js';
import {
  ShaderSelectorComponent,
  type ShaderSelectorComponentOptions
} from '@renderer/presentation/features/toolbar/shader-selector.component.js';
import { StatusNotificationComponent } from '@renderer/presentation/shared/status-notification.component.js';
import { StatusNotificationStore } from '@renderer/presentation/state/status-notification.store.js';
import type { EventBusLike } from '@platform/core';
import { DeviceStatusComponent } from '@renderer/presentation/shared/device-status.component.js';
import { DeviceStatusStore } from '@renderer/presentation/state/device-status.store.js';
import { StreamInfoStore } from '@renderer/presentation/state/stream-info.store.js';
import { TranscodeToastComponent } from '@renderer/presentation/features/transcode/transcode-toast.component.js';
import { TranscodeProgressStore } from '@renderer/presentation/state/transcode-progress.store.js';
import {
  UpdateSectionComponent,
  type UpdateSectionComponentOptions
} from '@renderer/presentation/features/updates/update-section.component.js';
import {
  SettingsMenuComponent,
  type SettingsMenuComponentOptions
} from '@renderer/presentation/features/settings/settings-menu.component.js';
import {
  NotesPanelComponent,
  type NotesPanelComponentOptions
} from '@renderer/presentation/features/notes/notes-panel.component.js';
import {
  RendererTemplateComponentIds,
  RendererTemplateCoreComponentIds,
  type RendererTemplateComponentElementSlices,
  type RendererTemplateComponentId
} from '@renderer/presentation/primitives/template-dom.contract.js';
import type {
  UIComponentContract,
  UIComponentDefinition,
  UIComponentDefinitionUnion,
  UIComponentDependencies,
  UIComponentElements,
  UIComponentId,
  UIComponentStage
} from '@renderer/presentation/controller/component.registry.js';

export type StatusNotificationComponentDependencies = {
  eventBus: EventBusLike;
};

export type DeviceStatusComponentDependencies = {
  eventBus: EventBusLike;
  appState: { deviceConnectedSignal: any };
};

export type StreamingControlsComponentDependencies = Pick<
  StreamingControlsComponentOptions,
  'bodyClassManager'
> & {
  eventBus: EventBusLike;
};

export type TranscodeToastComponentDependencies = {
  eventBus: EventBusLike;
};

export type SettingsMenuComponentDependencies =
  Omit<SettingsMenuComponentOptions, 'updateSectionComponent'> & {
    eventBus: UpdateSectionComponentOptions['eventBus'];
    loggerFactory: NonNullable<UpdateSectionComponentOptions['loggerFactory']>;
    updateOrchestrator?: UpdateSectionComponentOptions['updateOrchestrator'] | null;
  };

export interface RendererUiComponentCatalog {
  statusNotificationComponent: UIComponentContract<
    RendererTemplateComponentElementSlices['statusNotificationComponent'],
    StatusNotificationComponentDependencies,
    StatusNotificationComponent
  >;
  deviceStatusComponent: UIComponentContract<
    RendererTemplateComponentElementSlices['deviceStatusComponent'],
    DeviceStatusComponentDependencies,
    DeviceStatusComponent
  >;
  streamControlsComponent: UIComponentContract<
    RendererTemplateComponentElementSlices['streamControlsComponent'],
    StreamingControlsComponentDependencies,
    StreamingControlsComponent
  >;
  transcodeToastComponent: UIComponentContract<
    RendererTemplateComponentElementSlices['transcodeToastComponent'],
    TranscodeToastComponentDependencies,
    TranscodeToastComponent
  >;
  settingsMenuComponent: UIComponentContract<
    RendererTemplateComponentElementSlices['settingsMenuComponent'],
    SettingsMenuComponentDependencies,
    SettingsMenuComponent
  >;
  shaderSelectorComponent: UIComponentContract<
    RendererTemplateComponentElementSlices['shaderSelectorComponent'],
    ShaderSelectorComponentOptions,
    ShaderSelectorComponent
  >;
  notesPanelComponent: UIComponentContract<
    RendererTemplateComponentElementSlices['notesPanelComponent'],
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

type RendererUiComponentDefinition<TId extends RendererUiComponentId = RendererUiComponentId> =
  UIComponentDefinition<RendererUiComponentCatalog, TId>;

type RendererUiComponentFactoryDefinition<TId extends RendererUiComponentId = RendererUiComponentId> =
  Omit<RendererUiComponentDefinition<TId>, 'id' | 'stage'>;

type RendererUiComponentDefinitionUnion =
  UIComponentDefinitionUnion<RendererUiComponentCatalog>;

type RendererUiComponentDefinitionById = {
  readonly [TId in RendererUiComponentId]: TId extends RendererTemplateComponentId
    ? RendererUiComponentDefinition<TId>
    : never;
} & {
  readonly [TId in RendererTemplateComponentId]: TId extends RendererUiComponentId
    ? RendererUiComponentDefinition<TId>
    : never;
};

type RendererUiComponentFactoryDefinitionById = {
  readonly [TId in RendererUiComponentId]: TId extends RendererTemplateComponentId
    ? RendererUiComponentFactoryDefinition<TId>
    : never;
} & {
  readonly [TId in RendererTemplateComponentId]: TId extends RendererUiComponentId
    ? RendererUiComponentFactoryDefinition<TId>
    : never;
};

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

const rendererTemplateCoreComponentIds = new Set<RendererTemplateComponentId>(RendererTemplateCoreComponentIds);

function getRendererUiComponentStage(id: RendererTemplateComponentId): UIComponentStage {
  return rendererTemplateCoreComponentIds.has(id) ? 'core' : 'deferred';
}

const rendererUiComponentDefinitionInputsById = {
  statusNotificationComponent: {
    create: ({ elements = {}, dependencies = {} }) => new StatusNotificationComponent({
      elements,
      store: new StatusNotificationStore({
        eventBus: requireDependency('statusNotificationComponent', dependencies, 'eventBus')
      })
    })
  },
  deviceStatusComponent: {
    create: ({ elements = {}, dependencies = {} }) => {
      const eventBus = requireDependency('deviceStatusComponent', dependencies, 'eventBus');
      const appState = requireDependency('deviceStatusComponent', dependencies, 'appState');
      return new DeviceStatusComponent({
        elements,
        store: new DeviceStatusStore({
          eventBus,
          deviceConnectedSignal: appState.deviceConnectedSignal
        })
      });
    }
  },
  streamControlsComponent: {
    create: ({ elements = {}, dependencies = {} }) => {
      const eventBus = requireDependency('streamControlsComponent', dependencies, 'eventBus');
      return new StreamingControlsComponent({
        elements,
        bodyClassManager: dependencies.bodyClassManager,
        store: new StreamInfoStore({ eventBus })
      });
    }
  },
  transcodeToastComponent: {
    create: ({ elements = {}, dependencies = {} }) =>
      new TranscodeToastComponent({
        elements,
        store: new TranscodeProgressStore({
          eventBus: requireDependency('transcodeToastComponent', dependencies, 'eventBus')
        })
      })
  },
  settingsMenuComponent: {
    create: ({ dependencies = {} }) => {
      const eventBus = requireDependency('settingsMenuComponent', dependencies, 'eventBus');
      const loggerFactory = requireDependency('settingsMenuComponent', dependencies, 'loggerFactory');
      const updateSectionComponent = dependencies.updateOrchestrator
        ? new UpdateSectionComponent({ updateOrchestrator: dependencies.updateOrchestrator, eventBus, loggerFactory })
        : null;
      return new SettingsMenuComponent({
        settingsService: requireDependency('settingsMenuComponent', dependencies, 'settingsService'),
        updateSectionComponent,
        logger: dependencies.logger
      });
    }
  },
  shaderSelectorComponent: {
    create: ({ dependencies = {} }) => new ShaderSelectorComponent({
      settingsService: requireDependency('shaderSelectorComponent', dependencies, 'settingsService'),
      appState: dependencies.appState,
      eventBus: requireDependency('shaderSelectorComponent', dependencies, 'eventBus'),
      logger: dependencies.logger
    })
  },
  notesPanelComponent: {
    create: ({ dependencies = {} }) => new NotesPanelComponent({
      notesService: requireDependency('notesPanelComponent', dependencies, 'notesService'),
      eventBus: requireDependency('notesPanelComponent', dependencies, 'eventBus'),
      logger: dependencies.logger
    })
  }
} as const satisfies RendererUiComponentFactoryDefinitionById;

function createRendererUiComponentDefinition<TId extends RendererUiComponentId & RendererTemplateComponentId>(
  id: TId
): RendererUiComponentDefinition<TId> {
  return {
    id,
    stage: getRendererUiComponentStage(id),
    ...rendererUiComponentDefinitionInputsById[id]
  };
}

const rendererUiComponentDefinitionsById = Object.fromEntries(
  RendererTemplateComponentIds.map((id) => [id, createRendererUiComponentDefinition(id)])
) as RendererUiComponentDefinitionById;

export const rendererUiComponentDefinitions = RendererTemplateComponentIds.map(
  (id) => rendererUiComponentDefinitionsById[id]
) satisfies readonly RendererUiComponentDefinitionUnion[];
