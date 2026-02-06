import { StreamingService } from '@renderer/infrastructure/services/streaming/streaming.service';

type RegistrableContainer = {
  registerSingleton(name: string, factory: (...args: any[]) => unknown, deps: string[]): void;
};

export function registerStreaming(container: RegistrableContainer): void {
  container.registerSingleton(
    'streamingService',
    function (deviceService, eventBus, loggerFactory, adapterFactory, ipcClient) {
      return new StreamingService({ deviceService, eventBus, loggerFactory, adapterFactory, ipcClient });
    },
    ['deviceService', 'eventBus', 'loggerFactory', 'adapterFactory', 'ipcClient']
  );
}
