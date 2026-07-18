// =============================================================================
// @platform/core - Foundational Core Utilities & Contracts
// =============================================================================
// This package contains common base classes, utility helpers, and design
// contracts used across the PrismGB application workspace.
// =============================================================================

export { isErrorLike, getErrorMessage } from './primitives/error.utils.js';



// -----------------------------------------------------------------------------
// Type Utilities
// -----------------------------------------------------------------------------
export type { ValueOf, LeafValues, AssertNever } from './types/type-utils.js';

// -----------------------------------------------------------------------------
// Core Primitives (Classes / Concrete Implementations)
// -----------------------------------------------------------------------------
export { getElectronApp } from './primitives/electron-app.utils.js';
export { deepFreeze, pruneUndefined } from './primitives/object.utils.js';

export { DisposableBag } from './primitives/disposable-bag.js';
export type { Disposable, DisposableFunction, DisposableKey, EventTargetLike } from './primitives/disposable-bag.js';
export { ManagedLifecycleHost } from './primitives/managed-lifecycle-host.js';
export { BaseService, type EventPublisherLike, type LoggerLike, type EventBusLike, type LoggerFactoryLike, type StorageServiceLike, type LogLevel } from './primitives/service.base.js';
export { BaseOrchestrator } from './primitives/orchestrator.base.js';
export { createOnEventDecorator, getEventHandlerBindings } from './primitives/event-decorator.js';
export type { EventHandlerBinding } from './primitives/event-decorator.js';
export { ConsoleLoggerFactory } from './primitives/console-logger.js';
export { safeDispose, safeDisposeAll } from './primitives/safe-disposer.utils.js';
export { applyBindingOverrides } from './primitives/binding-override.utils.js';
export type { BindingOverrideContainer } from './primitives/binding-override.utils.js';
export { escapeHtml, generateEntityId } from './primitives/string.utils.js';
export { isRecord, isPromiseLike } from './primitives/guards.utils.js';
export { throttle, debounce } from './primitives/timing.utils.js';
export { abortableDelay, raceWithTimeout } from './primitives/async.utils.js';
export type { TimedRaceOutcome } from './primitives/async.utils.js';
