import { CaptureService } from '@renderer/infrastructure/services/capture/capture.service';
import { CaptureGpuRecordingService } from '@renderer/infrastructure/services/capture/gpu-recording.service';
import { TranscodeService } from '@renderer/infrastructure/services/transcode/transcode.service';
import { CaptureSaveService } from '@renderer/infrastructure/services/capture/capture-save.service';
import type { RegistrableContainer } from './registrable-container.type';
import type { RendererContainerMap } from './renderer-container-map.type';

export function registerCapture(container: RegistrableContainer<RendererContainerMap>): void {
  container.autoRegister('captureService', CaptureService);
  container.autoRegister('gpuRecordingService', CaptureGpuRecordingService);
  container.autoRegister('transcodeService', TranscodeService);
  container.autoRegister('captureSaveService', CaptureSaveService);
}
