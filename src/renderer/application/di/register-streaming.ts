import { StreamingService } from '@renderer/infrastructure/services/streaming/streaming.service';
import {
  defineRendererDescriptors,
  registerRendererDescriptors
} from '@renderer/infrastructure/di/renderer-container.factory.js';
import type { RegistrableContainer } from './registrable-container.type';
import type { RendererContainerMap } from './renderer-container-map.type';

const rendererStreamingDescriptors = defineRendererDescriptors<RendererContainerMap>([
  {
    token: 'streamingService',
    kind: 'class',
    resolver: StreamingService
  }
]);

export function registerStreaming(container: RegistrableContainer<RendererContainerMap>): void {
  registerRendererDescriptors(container, rendererStreamingDescriptors);
}
