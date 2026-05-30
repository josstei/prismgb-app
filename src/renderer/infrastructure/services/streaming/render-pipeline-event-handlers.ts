import type { StreamingRenderPipelineService } from './render-pipeline.service.js';
import { isPerformanceStatePayload } from '@renderer/infrastructure/services/streaming/streaming-contracts.js';

export class RenderPipelineEventHandlers {
  constructor(private readonly service: StreamingRenderPipelineService) {}

  async handleCanvasExpired(): Promise<void> {
    await (this.service as any).canvasLifecycleService.handleCanvasExpired();
  }

  handlePerformanceStateChanged(state: unknown): void {
    if (!isPerformanceStatePayload(state) || typeof state.hidden !== 'boolean') {
      return;
    }

    const s = this.service as any;
    if (state.hidden === s._isHidden) {
      return;
    }

    s._isHidden = state.hidden;
    if (s._isHidden) {
      s._handleHidden();
    } else {
      s._handleVisible();
    }
  }

  handleRenderPresetChanged(presetId: string): void {
    const s = this.service as any;
    if (s._performanceModeEnabled) {
      s._userPresetId = presetId;
      s.logger.debug(`User selected ${presetId} preset - cached (performance mode active)`);
      return;
    }

    if (s._activeRenderer?.supportsPresets() && s._activeRenderer.isActive()) {
      s._activeRenderer.setPreset(presetId);
    }
  }

  handleFullscreenChange(): void {
    (this.service as any).canvasLifecycleService.handleFullscreenChange();
  }

  async handlePerformanceModeChanged(enabled: boolean): Promise<void> {
    const s = this.service as any;
    s._performanceModeEnabled = enabled;

    if (enabled) {
      await s._handlePerformanceModeEnabled();
    } else {
      await s._handlePerformanceModeDisabled();
    }
  }
}
