import type { StreamingCapabilities } from '@platform/events';
import { signal, type ReadonlySignal } from '@platform/ui-base/reactive';

interface AppStateDependencies {
  streamingService: {
    readonly isStreaming: boolean;
    readonly currentCapabilities: StreamingCapabilities | null;
    getStream(): MediaStream | null;
  };
  rendererDeviceRuntime: { readonly isConnected: boolean };
}

/** Read live media state from its owners; own only the cinematic preference. */
export class AppState {
  private readonly _isCinematicModeEnabled = signal(true);

  constructor(private readonly dependencies: AppStateDependencies) {}

  get isCinematicModeEnabled(): boolean {
    return this._isCinematicModeEnabled.value;
  }

  get cinematicModeSignal(): ReadonlySignal<boolean> {
    return this._isCinematicModeEnabled;
  }

  get isStreaming(): boolean {
    return this.dependencies.streamingService.isStreaming;
  }

  get deviceConnected(): boolean {
    return this.dependencies.rendererDeviceRuntime.isConnected;
  }

  get currentStream(): MediaStream | null {
    return this.dependencies.streamingService.getStream();
  }

  get currentCapabilities(): StreamingCapabilities | null {
    return this.dependencies.streamingService.currentCapabilities;
  }

  setCinematicMode(enabled: boolean): void {
    this._isCinematicModeEnabled.value = enabled;
  }
}
