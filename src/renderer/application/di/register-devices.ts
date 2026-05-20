import { StreamingAdapterFactory } from '@renderer/infrastructure/factories/streaming-adapter.factory';
import { DeviceChromaticAdapter } from '@renderer/infrastructure/adapters/devices/chromatic/chromatic.adapter';
import { DeviceStorageService } from '@renderer/infrastructure/services/devices/device-storage.service';
import { DeviceConnectionService } from '@renderer/infrastructure/services/devices/device-connection.service';
import { DeviceMediaService } from '@renderer/infrastructure/services/devices/device-media.service';
import { DeviceService } from '@renderer/infrastructure/services/devices/device.service';
import { DeviceOperationSequencerService } from '@renderer/infrastructure/services/devices/device-operation-sequencer.service';
import {
  defineRendererDescriptors,
  registerRendererDescriptors
} from '@renderer/infrastructure/di/renderer-container.factory.js';
import type { RegistrableContainer } from './registrable-container.type';
import type { RendererContainerMap } from './renderer-container-map.type';

type AdapterFactoryDependencies = Pick<RendererContainerMap, 'eventBus' | 'loggerFactory' | 'browserMediaService'>;

const rendererDeviceDescriptors = defineRendererDescriptors<RendererContainerMap>([
  {
    token: 'adapterFactory',
    kind: 'function',
    dependencies: ['eventBus', 'loggerFactory', 'browserMediaService'],
    resolver: ({ eventBus, loggerFactory, browserMediaService }: AdapterFactoryDependencies) => {
      const adapterClasses = new Map([
        ['chromatic-mod-retro', DeviceChromaticAdapter]
      ]);
      const adapterFactory = new StreamingAdapterFactory(eventBus, loggerFactory, browserMediaService, adapterClasses);
      adapterFactory.initialize();
      return adapterFactory;
    }
  },
  {
    token: 'deviceStorageService',
    kind: 'class',
    resolver: DeviceStorageService
  },
  {
    token: 'deviceConnectionService',
    kind: 'class',
    resolver: DeviceConnectionService
  },
  {
    token: 'deviceMediaService',
    kind: 'class',
    resolver: DeviceMediaService
  },
  {
    token: 'deviceService',
    kind: 'class',
    resolver: DeviceService
  },
  {
    token: 'deviceOperationSequencer',
    kind: 'class',
    resolver: DeviceOperationSequencerService
  }
]);

export function registerDevices(container: RegistrableContainer<RendererContainerMap>): void {
  registerRendererDescriptors(container, rendererDeviceDescriptors);
}
