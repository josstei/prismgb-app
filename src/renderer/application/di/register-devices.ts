import { StreamingAdapterFactory } from '@renderer/infrastructure/factories/streaming-adapter.factory';
import { DeviceChromaticAdapter } from '@renderer/infrastructure/adapters/devices/chromatic/chromatic.adapter';
import { DeviceStorageService } from '@renderer/infrastructure/services/devices/device-storage.service';
import { DeviceConnectionService } from '@renderer/infrastructure/services/devices/device-connection.service';
import { DeviceMediaService } from '@renderer/infrastructure/services/devices/device-media.service';
import { DeviceService } from '@renderer/infrastructure/services/devices/device.service';
import { DeviceOperationSequencerService } from '@renderer/infrastructure/services/devices/device-operation-sequencer.service';
import type { RegistrableContainer } from './registrable-container.type';
import type { RendererContainerMap } from './renderer-container-map.type';

export function registerDevices(container: RegistrableContainer<RendererContainerMap>): void {
  container.registerSingleton(
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

  container.registerSingleton(
    'deviceStorageService',
    function (storageService, loggerFactory) {
      return new DeviceStorageService({ storageService, loggerFactory });
    },
    ['storageService', 'loggerFactory']
  );

  container.registerSingleton(
    'deviceConnectionService',
    function (eventBus, loggerFactory, deviceStatusProvider) {
      return new DeviceConnectionService({ eventBus, loggerFactory, deviceStatusProvider });
    },
    ['eventBus', 'loggerFactory', 'deviceStatusProvider']
  );

  container.registerSingleton(
    'deviceMediaService',
    function (eventBus, loggerFactory, browserMediaService, deviceConnectionService, deviceStorageService, deviceChangeDebounceAdapter) {
      return new DeviceMediaService({ eventBus, loggerFactory, browserMediaService, deviceConnectionService, deviceStorageService, deviceChangeDebounceAdapter });
    },
    ['eventBus', 'loggerFactory', 'browserMediaService', 'deviceConnectionService', 'deviceStorageService', 'deviceChangeDebounceAdapter']
  );

  container.registerSingleton(
    'deviceService',
    function (eventBus, loggerFactory, deviceStatusProvider, deviceConnectionService, deviceStorageService, deviceMediaService) {
      return new DeviceService({ eventBus, loggerFactory, deviceStatusProvider, deviceConnectionService, deviceStorageService, deviceMediaService });
    },
    ['eventBus', 'loggerFactory', 'deviceStatusProvider', 'deviceConnectionService', 'deviceStorageService', 'deviceMediaService']
  );

  container.registerSingleton(
    'deviceOperationSequencer',
    function(deviceService, eventBus, loggerFactory) {
      return new DeviceOperationSequencerService({
        deviceService,
        eventBus,
        loggerFactory
      });
    },
    ['deviceService', 'eventBus', 'loggerFactory']
  );
}
