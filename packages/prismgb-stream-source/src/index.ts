export { AcquisitionContext } from './domain/acquisition-context';
export type { AcquisitionContextLike, AcquisitionOptions } from './domain/acquisition.types';
export { IStreamLifecycle, IConstraintBuilder } from './domain/acquisition.interface';

export { StreamAcquisitionOrchestrator } from './application/acquisition.orchestrator';

export { ConstraintBuilder } from './infrastructure/constraint-builder';
export { DeviceAwareFallbackStrategy } from './infrastructure/fallback-strategy';
export { BaseStreamLifecycle } from './infrastructure/stream-lifecycle.base';
