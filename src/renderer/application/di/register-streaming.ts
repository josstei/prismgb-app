import { StreamingService } from '@renderer/infrastructure/services/streaming/streaming.service';
import type { RegistrableContainer } from './registrable-container.type';

export function registerStreaming(container: RegistrableContainer): void {
  container.registerSingleton(
    'streamingService',
    function (deviceService, eventBus, loggerFactory, adapterFactory, ipcClient) {
      return new StreamingService({ deviceService, eventBus, loggerFactory, adapterFactory, ipcClient });
    },
    ['deviceService', 'eventBus', 'loggerFactory', 'adapterFactory', 'ipcClient']
  );
}
