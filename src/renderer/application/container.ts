import { Container, type ServiceIdentifier } from 'inversify';
import { TOKENS } from './di/tokens';
import { infrastructureModule } from './di/infrastructure.module';
import { applicationModule } from './di/application.module';
import { presentationModule } from './di/presentation.module';
import { StreamingCanvasLifecycleService } from '../infrastructure/services/streaming/canvas-lifecycle.service';
import {
  UiComponentHost,
  type RendererUiComponentInstanceMap
} from '../presentation/controller/ui-component.host';
import { RendererTemplateCoreComponentIds } from '../presentation/primitives/template-dom.contract';

export type RendererServiceContainer = Container;

const ALL_COMPONENT_TOKEN_MAP: Record<keyof RendererUiComponentInstanceMap, ServiceIdentifier> = {
  statusNotificationComponent: TOKENS.statusNotificationComponent,
  deviceStatusComponent: TOKENS.deviceStatusComponent,
  streamControlsComponent: TOKENS.streamControlsComponent,
  transcodeToastComponent: TOKENS.transcodeToastComponent,
  settingsMenuComponent: TOKENS.settingsMenuComponent,
  shaderSelectorComponent: TOKENS.shaderSelectorComponent,
  notesPanelComponent: TOKENS.notesPanelComponent
};

const CORE_COMPONENT_TOKEN_MAP: Partial<Record<keyof RendererUiComponentInstanceMap, ServiceIdentifier>> =
  Object.fromEntries(
    RendererTemplateCoreComponentIds.map((id) => [id, ALL_COMPONENT_TOKEN_MAP[id]])
  );

/**
 * Build a renderer DI container wired onto inversify: layer binding modules
 * register every token's construction, and `canvasLifecycleService` binds here
 * so its lazy read of `streamingRenderService` can close over this container
 * and break their circular dependency.
 */
export function createRendererContainer(): RendererServiceContainer {
  const container = new Container({ defaultScope: 'Singleton' });
  container.load(infrastructureModule, applicationModule, presentationModule);

  container.bind(TOKENS.canvasLifecycleService).toDynamicValue(() => new StreamingCanvasLifecycleService({
    streamViewService: container.get(TOKENS.streamViewService),
    viewportService: container.get(TOKENS.viewportService),
    eventBus: container.get(TOKENS.eventBus),
    loggerFactory: container.get(TOKENS.loggerFactory),
    get streamingRenderService() {
      return container.get(TOKENS.streamingRenderService);
    }
  })).inSingletonScope();

  container.bind(TOKENS.uiComponentHost).toDynamicValue(() => new UiComponentHost<RendererUiComponentInstanceMap>(
    <TInstance>(token: unknown): TInstance => container.get(token as ServiceIdentifier<TInstance>),
    CORE_COMPONENT_TOKEN_MAP,
    ALL_COMPONENT_TOKEN_MAP,
    container.get(TOKENS.loggerFactory)
  )).inSingletonScope();

  return container;
}

let container: RendererServiceContainer | null = null;

export function initializeContainer(): RendererServiceContainer {
  if (container) {
    console.warn('Container already initialized');
    return container;
  }

  container = createRendererContainer();
  console.log('DI Container initialized with domain services');
  return container;
}
