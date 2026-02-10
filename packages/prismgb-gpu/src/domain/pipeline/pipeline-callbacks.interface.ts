import type { IPipelineError } from './pipeline-error.interface';
import type { IPipelineStats } from './pipeline-stats.interface';
import type { PipelineState } from './pipeline-state';

export interface IPipelineCallbacks {
  onError?: (error: IPipelineError) => void;
  onStats?: (stats: IPipelineStats) => void;
  onStateChange?: (state: PipelineState) => void;
}
