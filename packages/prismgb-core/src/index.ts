// =============================================================================
// @prismgb/core - Foundational Core Utilities & Contracts
// =============================================================================
// This package contains common base classes, utility helpers, and design
// contracts used across the PrismGB application workspace.
// =============================================================================

// -----------------------------------------------------------------------------
// Error helpers
// -----------------------------------------------------------------------------

export interface ErrorLike {
  message: string;
}

export function isErrorLike(value: unknown): value is ErrorLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string'
  );
}

export function getErrorMessage(value: unknown, fallback = 'Unknown error'): string {
  if (isErrorLike(value)) {
    return value.message || fallback;
  }

  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  return fallback;
}

type ErrorLabelSource = { name?: unknown; message?: unknown };

function hasErrorLabelFields(value: unknown): value is ErrorLabelSource {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

export function formatErrorLabel(error: unknown): string {
  const errorLike = hasErrorLabelFields(error) ? error : {};
  const name = errorLike.name || 'Error';
  const message = errorLike.message || error;
  return `${name}: ${message}`;
}

// -----------------------------------------------------------------------------
// Core Interfaces
// -----------------------------------------------------------------------------
export type { Logger as ILogger, LoggerFactory as ILoggerFactory, LogLevel } from './interfaces/logger.js';

// -----------------------------------------------------------------------------
// Type Utilities
// -----------------------------------------------------------------------------
export type { ValueOf, UnionToIntersection, LeafValues, AssertNever } from './types/type-utils.js';

// -----------------------------------------------------------------------------
// Core Primitives (Classes / Concrete Implementations)
// -----------------------------------------------------------------------------
export { Container } from './primitives/container.js';
export type { Provider, ContainerDisposalLogger } from './primitives/container.js';
export { TypedRegistryFactory } from './primitives/typed-registry.js';
export type { RegistryFactory, RegistryEntry } from './primitives/typed-registry.js';
export { DisposableBag } from './primitives/disposable-bag.js';
export type { Disposable, DisposableFunction, DisposableKey } from './primitives/disposable-bag.js';
export { BaseService, type LoggerLike, type EventBusLike, type LoggerFactoryLike, type StorageServiceLike, type ServiceEventDescriptor } from './primitives/service.base.js';
export { BaseOrchestrator } from './primitives/orchestrator.base.js';
export { ConsoleLoggerFactory } from './primitives/console-logger.js';
export { safeDispose, safeDisposeAll } from './primitives/safe-disposer.utils.js';
export { escapeHtml, generateEntityId } from './primitives/string.utils.js';
export { isRecord, isNumber, isString } from './primitives/guards.utils.js';
export { throttle } from './primitives/timing.utils.js';
export { createDeferred } from './primitives/async.utils.js';
export type { Deferred } from './primitives/async.utils.js';
export { PerformanceCache, AnimationCache } from './primitives/performance-cache.utils.js';
