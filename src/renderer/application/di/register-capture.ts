import { CaptureService } from '@renderer/infrastructure/services/capture/capture.service';
import { CaptureGpuRecordingService } from '@renderer/infrastructure/services/capture/gpu-recording.service';
import { TranscodeService } from '@renderer/infrastructure/services/transcode/transcode.service';
import { CaptureSaveService } from '@renderer/infrastructure/services/capture/capture-save.service';
import {
  defineRendererDescriptors,
  registerRendererDescriptors
} from '@renderer/infrastructure/di/renderer-container.factory.js';
import type { RegistrableContainer } from './registrable-container.type';
import type { RendererContainerMap } from './renderer-container-map.type';

const rendererCaptureDescriptors = defineRendererDescriptors<RendererContainerMap>([
  {
    token: 'captureService',
    kind: 'class',
    resolver: CaptureService
  },
  {
    token: 'gpuRecordingService',
    kind: 'class',
    resolver: CaptureGpuRecordingService
  },
  {
    token: 'transcodeService',
    kind: 'class',
    resolver: TranscodeService
  },
  {
    token: 'captureSaveService',
    kind: 'class',
    resolver: CaptureSaveService
  }
]);

export function registerCapture(container: RegistrableContainer<RendererContainerMap>): void {
  registerRendererDescriptors(container, rendererCaptureDescriptors);
}
