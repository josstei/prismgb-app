import { CaptureService } from '@renderer/infrastructure/services/capture/capture.service';
import { CaptureGpuRecordingService } from '@renderer/infrastructure/services/capture/gpu-recording.service';
import { TranscodeService } from '@renderer/infrastructure/services/transcode/transcode.service';
import { CaptureSaveService } from '@renderer/infrastructure/services/capture/capture-save.service';
import type { RegistrableContainer } from './registrable-container.type';
import type { RendererContainerMap } from './renderer-container-map.type';

export function registerCapture(container: RegistrableContainer<RendererContainerMap>): void {
  container.registerSingleton(
    'captureService',
    function (eventBus, loggerFactory) {
      return new CaptureService({ eventBus, loggerFactory });
    },
    ['eventBus', 'loggerFactory']
  );

  container.registerSingleton(
    'gpuRecordingService',
    function (gpuRendererService, eventBus, loggerFactory) {
      return new CaptureGpuRecordingService({ gpuRendererService, eventBus, loggerFactory });
    },
    ['gpuRendererService', 'eventBus', 'loggerFactory']
  );

  container.registerSingleton(
    'transcodeService',
    function (eventBus, loggerFactory) {
      return new TranscodeService({ eventBus, loggerFactory });
    },
    ['eventBus', 'loggerFactory']
  );

  container.registerSingleton(
    'captureSaveService',
    function (eventBus, settingsService, transcodeService, loggerFactory) {
      return new CaptureSaveService({ eventBus, settingsService, transcodeService, loggerFactory });
    },
    ['eventBus', 'settingsService', 'transcodeService', 'loggerFactory']
  );
}
