import { BaseOrchestrator, type LoggerFactoryLike } from '@platform/core';
import { EventChannels, OnEvent, type TypedEventBusLike } from '@platform/events';

type PerformanceState = {
  performanceModeEnabled: boolean;
  hidden: boolean;
  idle: boolean;
  reducedMotion: boolean;
};

type PerformanceStateOrchestratorDependencies = {
  eventBus: TypedEventBusLike;
  loggerFactory: LoggerFactoryLike;
  visibilityAdapter: {
    isHidden(): boolean;
    onVisibilityChange(callback: (hidden: boolean) => void): () => void;
  };
  userActivityAdapter: {
    onActivity(callback: () => void): () => void;
  };
  reducedMotionAdapter: {
    prefersReducedMotion(): boolean;
    onChange(callback: (reducedMotion: boolean) => void): () => void;
  };
};

const IDLE_TIMER = Symbol('performanceIdleTimer');
const IDLE_DELAY_MS = 30000;

/** Owns browser activity subscriptions, performance state and its idle timer. */
export class PerformanceStateOrchestrator extends BaseOrchestrator {
  protected readonly eventBus: TypedEventBusLike;
  private readonly state: PerformanceState = {
    performanceModeEnabled: false,
    hidden: false,
    idle: false,
    reducedMotion: false
  };
  private isStreaming = false;
  private lastIdleReset = 0;

  constructor(private readonly dependencies: PerformanceStateOrchestratorDependencies) {
    super(dependencies, 'PerformanceStateOrchestrator');
    this.eventBus = dependencies.eventBus;
  }

  async onInitialize(): Promise<void> {
    const { visibilityAdapter, userActivityAdapter, reducedMotionAdapter } = this.dependencies;
    this.track(visibilityAdapter.onVisibilityChange((hidden) => {
      const changed = this.updateState({ hidden });
      if (hidden) this.updateState({ idle: false });
      if (changed) this.syncIdleTimer();
    }));
    this.updateState({ hidden: visibilityAdapter.isHidden() });

    this.track(reducedMotionAdapter.onChange((reducedMotion) => this.updateState({ reducedMotion })));
    this.updateState({ reducedMotion: reducedMotionAdapter.prefersReducedMotion() });

    this.track(userActivityAdapter.onActivity(() => {
      if (!this.shouldTrackIdle() || performance.now() - this.lastIdleReset < 1000) return;
      this.lastIdleReset = performance.now();
      this.updateState({ idle: false });
      this.syncIdleTimer();
    }));
    this.syncIdleTimer();
    this.publishState();
  }

  @OnEvent(EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED)
  private handlePerformanceModeChanged(enabled: boolean): void {
    enabled = Boolean(enabled);
    if (this.updateState({ performanceModeEnabled: enabled })) {
      this.syncIdleTimer();
      this.eventBus.publish(EventChannels.PERFORMANCE.RENDER_MODE_CHANGED, enabled);
    }
  }

  @OnEvent(EventChannels.STREAM.STARTED)
  private handleStreamStarted(): void {
    this.setStreaming(true);
  }

  @OnEvent(EventChannels.STREAM.STOPPED)
  private handleStreamStopped(): void {
    this.setStreaming(false);
  }

  private setStreaming(isStreaming: boolean): void {
    this.isStreaming = isStreaming;
    this.updateState({ idle: false });
    this.syncIdleTimer();
  }

  private shouldTrackIdle(): boolean {
    return !this.isStreaming && !this.state.hidden && !this.state.performanceModeEnabled;
  }

  private syncIdleTimer(): void {
    if (!this.shouldTrackIdle()) {
      this.cancelManaged(IDLE_TIMER);
      return;
    }
    if (this.state.idle) return;

    this.lastIdleReset = performance.now();
    this.schedule(IDLE_TIMER, () => this.updateState({ idle: true }), IDLE_DELAY_MS);
  }

  private updateState(partial: Partial<PerformanceState>): boolean {
    let changed = false;
    for (const key of Object.keys(partial) as Array<keyof PerformanceState>) {
      const value = partial[key];
      if (value !== undefined && this.state[key] !== value) {
        this.state[key] = value;
        changed = true;
      }
    }
    if (changed) this.publishState();
    return changed;
  }

  private publishState(): void {
    this.eventBus.publish(EventChannels.PERFORMANCE.STATE_CHANGED, { ...this.state });
  }
}
