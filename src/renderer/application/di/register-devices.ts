import { StreamingAdapterFactory } from '@renderer/infrastructure/factories/streaming-adapter.factory';
import { DeviceChromaticAdapter } from '@renderer/infrastructure/adapters/devices/chromatic/chromatic.adapter';
import { chromaticConfig } from '@shared/features/devices/profiles/chromatic/device-chromatic.config.js';
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
        [chromaticConfig.id, DeviceChromaticAdapter]
      ]);
      const adapterFactory = new StreamingAdapterFactory(eventBus, loggerFactory, browserMediaService, adapterClasses);
      adapterFactory.initialize();
      return adapterFactory;
    }
  },
  {
    token: 'deviceStorageService',
    kind: 'class',
    resolver: DeviceStorageService,
    disposal: 'dispose'
  },
  {
    token: 'deviceConnectionService',
    kind: 'class',
    resolver: DeviceConnectionService,
    disposal: 'dispose'
  },
  {
    token: 'deviceMediaService',
    kind: 'class',
    resolver: DeviceMediaService,
    disposal: 'dispose'
  },
  {
    token: 'deviceService',
    kind: 'class',
    resolver: DeviceService,
    disposal: 'dispose'
  },
  {
    token: 'deviceOperationSequencer',
    kind: 'class',
    resolver: DeviceOperationSequencerService,
    disposal: 'dispose'
  }
]);

export function registerDevices(container: RegistrableContainer<RendererContainerMap>): void {
  registerRendererDescriptors(container, rendererDeviceDescriptors);
}
