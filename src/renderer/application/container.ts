import { Container, type ServiceIdentifier } from 'inversify';
import { TOKENS, type TokenKey } from './di/tokens.js';
import { infrastructureModule } from './di/infrastructure.module.js';
import { applicationModule } from './di/application.module.js';
import { presentationModule } from './di/presentation.module.js';
import { StreamingCanvasLifecycleService } from '../infrastructure/services/streaming/canvas-lifecycle.service.js';

export type RendererServiceContainer = Container;

/**
 * Build a renderer DI container wired onto inversify: layer binding modules
 * register every token's construction, `canvasLifecycleService` binds here so
 * its lazy read of `streamingRenderService` can close over this container and
 * break their circular dependency, then overrides replace bindings for tests.
 * No code generation — the binding modules are the source of truth.
 */
export function createRendererContainer(overrides: Partial<Record<TokenKey, unknown>> = {}): RendererServiceContainer {
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

  for (const [key, value] of Object.entries(overrides)) {
    const token: ServiceIdentifier = TOKENS[key as TokenKey];
    if (container.isBound(token)) {
      container.unbind(token);
    }
    container.bind(token).toConstantValue(value);
  }

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
