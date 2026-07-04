import { ContainerModule } from 'inversify';
import { StreamingOrchestrator } from '../orchestrators/streaming.orchestrator';
import { StreamingAudioOrchestrator } from '../orchestrators/streaming-audio.orchestrator';
import { CaptureOrchestrator } from '../orchestrators/capture.orchestrator';
import { SettingsDisplayModeOrchestrator } from '../orchestrators/display-mode.orchestrator';
import { UISetupOrchestrator } from '../orchestrators/ui-setup.orchestrator';
import { PerformanceAnimationOrchestrator } from '../orchestrators/performance/performance-animation.orchestrator';
import { PerformanceMetricsOrchestrator } from '../orchestrators/performance/performance-metrics.orchestrator';
import { PerformanceStateOrchestrator } from '../orchestrators/performance/performance-state.orchestrator';
import { AppOrchestrator } from '../orchestrators/app.orchestrator';
import { TOKENS } from './tokens.js';

/**
 * Binding module for every renderer application-layer orchestrator token.
 * `appState` is deliberately absent here — it has no base class, all-optional
 * dependencies, and a non-standard construction shape, so it binds through a
 * factory in `presentation.module.ts` alongside the other platform-adjacent
 * non-decorated classes.
 */
export const applicationModule = new ContainerModule(({ bind }) => {
  bind(TOKENS.streamingOrchestrator).to(StreamingOrchestrator).inSingletonScope();
  bind(TOKENS.streamingAudioOrchestrator).to(StreamingAudioOrchestrator).inSingletonScope();
  bind(TOKENS.captureOrchestrator).to(CaptureOrchestrator).inSingletonScope();
  bind(TOKENS.displayModeOrchestrator).to(SettingsDisplayModeOrchestrator).inSingletonScope();
  bind(TOKENS.uiSetupOrchestrator).to(UISetupOrchestrator).inSingletonScope();
  bind(TOKENS.animationPerformanceOrchestrator).to(PerformanceAnimationOrchestrator).inSingletonScope();
  bind(TOKENS.performanceMetricsOrchestrator).to(PerformanceMetricsOrchestrator).inSingletonScope();
  bind(TOKENS.performanceStateOrchestrator).to(PerformanceStateOrchestrator).inSingletonScope();
  bind(TOKENS.appOrchestrator).to(AppOrchestrator).inSingletonScope();
});
