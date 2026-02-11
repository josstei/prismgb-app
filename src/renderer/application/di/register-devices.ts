import { StreamingAdapterFactory } from '@renderer/infrastructure/factories/streaming-adapter.factory';
import { DeviceChromaticAdapter } from '@renderer/infrastructure/adapters/devices/chromatic/chromatic.adapter';
import { DeviceStorageService } from '@renderer/infrastructure/services/devices/device-storage.service';
import { DeviceMediaService } from '@renderer/infrastructure/services/devices/device-media.service';
import { DeviceOperationSequencerService } from '@renderer/infrastructure/services/devices/device-operation-sequencer.service';
import type { RegistrableContainer } from './registrable-container.type';
import type { RendererContainerMap } from './renderer-container-map.type';

export function registerDevices(container: RegistrableContainer<RendererContainerMap>): void {
  container.registerFactory(
    'adapterFactory',
    function (eventBus, loggerFactory, browserMediaService) {
      const adapterClasses = new Map([
        ['chromatic-mod-retro', DeviceChromaticAdapter]
      ]);
      const adapterFactory = new StreamingAdapterFactory(eventBus, loggerFactory, browserMediaService, adapterClasses);
      adapterFactory.initialize();
      return adapterFactory;
    },
    ['eventBus', 'loggerFactory', 'browserMediaService']
  );

  container.autoRegister('deviceStorageService', DeviceStorageService);
  container.autoRegister('deviceMediaService', DeviceMediaService);
  container.autoRegister('deviceOperationSequencer', DeviceOperationSequencerService);
}
