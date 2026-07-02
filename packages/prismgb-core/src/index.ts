// =============================================================================
// @prismgb/core - Foundational Core Utilities & Contracts
// =============================================================================
// This package contains common base classes, utility helpers, and design
// contracts used across the PrismGB application workspace.
// =============================================================================

export { isErrorLike, getErrorMessage } from './primitives/error.utils.js';
export type { ErrorLike } from './primitives/error.utils.js';



// -----------------------------------------------------------------------------
// Type Utilities
// -----------------------------------------------------------------------------
export type { ValueOf, UnionToIntersection, LeafValues, AssertNever } from './types/type-utils.js';

// -----------------------------------------------------------------------------
// Core Primitives (Classes / Concrete Implementations)
// -----------------------------------------------------------------------------
export { getElectronApp } from './primitives/electron-app.utils.js';
export type { ElectronAppLike } from './primitives/electron-app.utils.js';

export { Container } from './primitives/container.js';
export type { Provider, ContainerDisposalLogger } from './primitives/container.js';
export { DisposableBag } from './primitives/disposable-bag.js';
export type { Disposable, DisposableFunction, DisposableKey, EventTargetLike } from './primitives/disposable-bag.js';
export { BaseService, type LoggerLike, type EventBusLike, type LoggerFactoryLike, type StorageServiceLike, type ServiceEventDescriptor, type LogLevel } from './primitives/service.base.js';
export { BaseOrchestrator } from './primitives/orchestrator.base.js';
export { ConsoleLoggerFactory } from './primitives/console-logger.js';
export { safeDispose, safeDisposeAll } from './primitives/safe-disposer.utils.js';
export { escapeHtml, generateEntityId } from './primitives/string.utils.js';
export { isRecord, isNumber, isString, isPromiseLike } from './primitives/guards.utils.js';
export { throttle } from './primitives/timing.utils.js';
export { createDeferred } from './primitives/async.utils.js';
export type { Deferred } from './primitives/async.utils.js';
