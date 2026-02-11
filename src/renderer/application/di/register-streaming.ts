import { StreamingService } from '@renderer/infrastructure/services/streaming/streaming.service';
import type { RegistrableContainer } from './registrable-container.type';
import type { RendererContainerMap } from './renderer-container-map.type';

export function registerStreaming(container: RegistrableContainer<RendererContainerMap>): void {
  container.autoRegister('streamingService', StreamingService);
}
