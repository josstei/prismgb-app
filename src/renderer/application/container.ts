import { Container } from 'inversify';
import { TOKENS } from './di/tokens';
import { servicesModule } from './di/services.module';
import { presentationModule } from './di/presentation.module';
import { StreamingCanvasLifecycleService } from '../infrastructure/services/streaming/canvas-lifecycle.service';
import { UiComponentHost } from '../presentation/ui-component.host';

export type RendererServiceContainer = Container;

/**
 * `canvasLifecycleService` and `uiComponentHost` bind here because they resolve through
 * this container lazily: the first to break its cycle with `streamingRenderService`, the
 * second to construct each UI component on first use.
 */
export function createRendererContainer(): RendererServiceContainer {
  const container = new Container({ defaultScope: 'Singleton' });
  container.load(servicesModule, presentationModule);

  container.bind(TOKENS.canvasLifecycleService).toDynamicValue(() => new StreamingCanvasLifecycleService({
    streamViewService: container.get(TOKENS.streamViewService),
    viewportService: container.get(TOKENS.viewportService),
    loggerFactory: container.get(TOKENS.loggerFactory),
    get streamingRenderService() {
      return container.get(TOKENS.streamingRenderService);
    }
  }));

  container.bind(TOKENS.uiComponentHost).toDynamicValue(() => new UiComponentHost(
    (token) => container.get(token),
    container.get(TOKENS.loggerFactory)
  ));

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
