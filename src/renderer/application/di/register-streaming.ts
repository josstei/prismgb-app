import { StreamingService } from '@renderer/infrastructure/services/streaming/streaming.service';
import type { RegistrableContainer } from './registrable-container.type';
import type { RendererContainerMap } from './renderer-container-map.type';

export function registerStreaming(container: RegistrableContainer<RendererContainerMap>): void {
  container.registerSingleton(
    'streamingService',
    function (deviceService, eventBus, loggerFactory, adapterFactory, ipcClient) {
      return new StreamingService({ deviceService, eventBus, loggerFactory, adapterFactory, ipcClient });
    },
    ['deviceService', 'eventBus', 'loggerFactory', 'adapterFactory', 'ipcClient']
  );
}
