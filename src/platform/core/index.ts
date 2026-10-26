// =============================================================================
// @platform/core - Foundational Core Utilities & Contracts
// =============================================================================
// This package contains common base classes, utility helpers, and design
// contracts used across the PrismGB application workspace.
// =============================================================================

export { getErrorMessage } from './primitives/error.utils.js';
// -----------------------------------------------------------------------------
// Core Primitives (Classes / Concrete Implementations)
// -----------------------------------------------------------------------------
export { deepFreeze, pruneUndefined } from './primitives/object.utils.js';

export { DisposableBag } from './primitives/disposable-bag.js';
export type { DisposableFunction, DisposableKey } from './primitives/disposable-bag.js';
export { ManagedLifecycleHost, type EventTargetLike } from './primitives/managed-lifecycle-host.js';
export { BaseService, type EventPublisherLike, type LoggerLike, type EventBusLike, type LoggerFactoryLike, type StorageServiceLike, type LogLevel } from './primitives/service.base.js';
export { BaseOrchestrator } from './primitives/orchestrator.base.js';
export { createOnEventDecorator } from './primitives/event-decorator.js';
export { ConsoleLoggerFactory } from './primitives/console-logger.js';
export { escapeHtml, generateEntityId } from './primitives/string.utils.js';
export { isRecord, isPromiseLike } from './primitives/guards.utils.js';
export { throttle, debounce } from './primitives/timing.utils.js';
export { abortableDelay, raceWithTimeout } from './primitives/async.utils.js';
export type { TimedRaceOutcome } from './primitives/async.utils.js';

export { createApplicationLifecycle, disposeInOrder } from './primitives/application-lifecycle.js';
