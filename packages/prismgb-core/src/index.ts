// =============================================================================
// @prismgb/core - Foundational Core Utilities & Contracts
// =============================================================================
// This package contains common base classes, error types, utility helpers,
// and design contracts used across the PrismGB application workspace.
// =============================================================================

// -----------------------------------------------------------------------------
// Core Utilities & Custom Errors
// -----------------------------------------------------------------------------

/**
 * Standard base error class for the PrismGB application ecosystem.
 */
export class PrismError extends Error {
  public readonly code: string;
  public readonly timestamp: Date;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, code = 'INTERNAL_ERROR', details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.timestamp = new Date();
    this.details = details;
    
    // Maintain proper stack trace in V8 engines
    if (typeof (Error as any).captureStackTrace === 'function') {
      (Error as any).captureStackTrace(this, this.constructor);
    }
  }

  public toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      timestamp: this.timestamp.toISOString(),
      details: this.details,
      stack: this.stack
    };
  }
}

/**
 * Error thrown during validation steps.
 */
export class PrismValidationError extends PrismError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', details);
  }
}

/**
 * Error thrown during application, service, or driver startup initialization.
 */
export class PrismInitializationError extends PrismError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'INITIALIZATION_ERROR', details);
  }
}

export class AppError extends Error {
  public readonly context: Record<string, unknown>;
  public readonly timestamp: number;

  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message);
    this.name = 'AppError';
    this.context = context;
    this.timestamp = Date.now();
    if (typeof (Error as any).captureStackTrace === 'function') {
      (Error as any).captureStackTrace(this, AppError);
    }
  }
}

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

/**
 * Filename generation helpers for capture outputs.
 */
export class FilenameGenerator {
  static timestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const millis = String(now.getMilliseconds()).padStart(3, '0');
    return `${year}${month}${day}-${hours}${minutes}${seconds}-${millis}`;
  }

  static forScreenshot(): string {
    return `prismgb-screenshot-${this.timestamp()}.png`;
  }

  static forRecording(): string {
    return `prismgb-recording-${this.timestamp()}.webm`;
  }
}

/**
 * standard disposable interface for cleaning up resources.
 */
export interface IDisposable {
  dispose(): void | Promise<void>;
}

/**
 * Check if an object implements the IDisposable contract.
 */
export function isDisposable(obj: unknown): obj is IDisposable {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'dispose' in obj &&
    typeof (obj as Record<string, unknown>).dispose === 'function'
  );
}

/**
 * Safe disposal helper that catches and swallows errors to ensure cleanup lists proceed.
 */
export async function safeDisposeItem(
  resource: unknown,
  logger?: { error(...args: unknown[]): void }
): Promise<boolean> {
  if (!isDisposable(resource)) {
    return false;
  }

  try {
    const result = resource.dispose();
    if (result instanceof Promise) {
      await result;
    }
    return true;
  } catch (error) {
    if (logger && typeof logger.error === 'function') {
      logger.error('Error during resource disposal:', error);
    }
    return false;
  }
}

/**
 * Dispose all resources in the collection in parallel or sequence safely.
 */
export async function safeDisposeItemAll(
  resources: unknown[],
  logger?: { error(...args: unknown[]): void }
): Promise<void> {
  await Promise.all(resources.map(res => safeDisposeItem(res, logger)));
}

/**
 * Basic generic subscription/unsubscription interface for event-based systems.
 */
export interface ISubscription {
  unsubscribe(): void;
}

/**
 * Helper to wrap event listeners and return a subscription handler.
 */
export function createSubscription(unsubscribe: () => void): ISubscription {
  let active = true;
  return {
    unsubscribe() {
      if (active) {
        unsubscribe();
        active = false;
      }
    }
  };
}

// -----------------------------------------------------------------------------
// Core Interfaces
// -----------------------------------------------------------------------------
export type { Adapter } from './interfaces/adapter.js';
export type { Cache as ICache } from './interfaces/cache.js';
export type { EventBus as IEventBus } from './interfaces/event-bus.js';
export type { Factory as IFactory } from './interfaces/factory.js';
export type { LogWriter } from './interfaces/log-writer.js';
export type { Logger as ILogger, LoggerFactory as ILoggerFactory, LogLevel } from './interfaces/logger.js';
export type { Storage as IStorage } from './interfaces/storage.js';
export type { Store as IStore } from './interfaces/store.js';
export type { Strategy } from './interfaces/strategy.js';
export type { Validator as IValidator } from './interfaces/validator.js';

// -----------------------------------------------------------------------------
// Core Primitives (Classes / Concrete Implementations)
// -----------------------------------------------------------------------------
export { Bus } from './primitives/bus.js';
export { Cache } from './primitives/cache.js';
export { Container } from './primitives/container.js';
export { Factory } from './primitives/factory.js';
export { Logger } from './primitives/logger.js';
export { Pipeline } from './primitives/pipeline.js';
export { Registry } from './primitives/registry.js';
export { Store } from './primitives/store.js';
export { Validator } from './primitives/validator.js';
export { DisposableBag } from './primitives/disposable-bag.js';
export type { Disposable, DisposableFunction, DisposableKey } from './primitives/disposable-bag.js';
export { BaseService, type LoggerLike, type EventBusLike, type LoggerFactoryLike, type StorageServiceLike, type ServiceEventDescriptor } from './primitives/service.base.js';
export { BaseOrchestrator } from './primitives/orchestrator.base.js';
export { safeDispose, safeDisposeAll } from './primitives/safe-disposer.utils.js';
export { formatDeviceInfo } from './primitives/formatters.utils.js';
export { escapeHtml, generateEntityId } from './primitives/string.utils.js';
export { PerformanceCache, AnimationCache } from './primitives/performance-cache.utils.js';

// -----------------------------------------------------------------------------
// Dependency Injection Decorators
// -----------------------------------------------------------------------------
export { Service } from './di/decorators.js';
export type { ServiceOptions } from './di/decorators.js';
