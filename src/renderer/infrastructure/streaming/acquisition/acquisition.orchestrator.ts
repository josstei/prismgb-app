import { DeviceAwareFallbackStrategy } from './fallback-strategy';
import { formatErrorLabel } from '@shared/lib/errors.utils.js';

import type { AcquisitionContextLike, AcquisitionOptions } from './acquisition.types';
import type { LoggerLike } from '@shared/interfaces/infrastructure.types.js';

interface ConstraintBuilderLike {
  build(context: AcquisitionContextLike, detailLevel: string, options?: Record<string, unknown>): MediaStreamConstraints;
}

interface StreamLifecycleLike {
  acquireStream(constraints: MediaStreamConstraints, options?: Record<string, unknown>): Promise<MediaStream>;
}

interface AcquisitionResult {
  stream: MediaStream;
  strategy: string;
  context: AcquisitionContextLike;
}

type StreamAcquisitionDependencies = {
  constraintBuilder?: ConstraintBuilderLike;
  streamLifecycle?: StreamLifecycleLike;
  logger?: LoggerLike;
  fallbackStrategy?: DeviceAwareFallbackStrategy;
};

/**
 * StreamAcquisitionOrchestrator
 *
 * Coordinates stream acquisition with device-aware fallback handling.
 * Uses AcquisitionContext to preserve device identity throughout the
 * entire acquisition lifecycle - device targeting cannot be lost.
 *
 * Key design decisions:
 * - Takes AcquisitionContext instead of profile + options
 * - Delegates all constraint building to ConstraintBuilder
 * - No conditional helper methods (_maybe*, _soften*)
 * - Deterministic behavior throughout
 */
export class StreamAcquisitionOrchestrator {
  constraintBuilder: ConstraintBuilderLike | undefined;
  streamLifecycle: StreamLifecycleLike | undefined;
  logger: LoggerLike | undefined;
  fallbackStrategy: DeviceAwareFallbackStrategy;

  constructor(dependencies: StreamAcquisitionDependencies = {}) {
    this.constraintBuilder = dependencies.constraintBuilder;
    this.streamLifecycle = dependencies.streamLifecycle;
    this.logger = dependencies.logger;
    this.fallbackStrategy = dependencies.fallbackStrategy || new DeviceAwareFallbackStrategy();
  }

  /**
   * Acquire stream with automatic fallback
   * @param {AcquisitionContext} context - Immutable acquisition context with device identity
   * @param {Object} options - Additional options
   * @returns {Promise<{stream: MediaStream, strategy: string, context: AcquisitionContext}>}
   */
  async acquire(context: AcquisitionContextLike, options: AcquisitionOptions = {}): Promise<AcquisitionResult> {
    this.fallbackStrategy.initialize(context);

    let lastError: unknown;
    let currentStrategy = 'full';

    // Primary acquisition attempt with full constraints
    try {
      const constraints = this.constraintBuilder!.build(context, 'full', options);
      this._log('info', `Attempting primary acquisition (full) for device: ${context.deviceId}`);
      this._log('debug', `Constraints: ${this._stringifyConstraints(constraints)}`);

      const stream = await this.streamLifecycle!.acquireStream(constraints, options);

      this._log('info', 'Stream acquired with primary strategy');
      return { stream, strategy: currentStrategy, context };

    } catch (error) {
      lastError = error;
      const errLabel = formatErrorLabel(error as Error);
      this._log('warn', `Primary acquisition failed - ${errLabel}`);

      // For OverconstrainedError, try simple constraints before fallback chain
      if ((error as { name?: string })?.name === 'OverconstrainedError') {
        try {
          const simpleConstraints = this.constraintBuilder!.build(context, 'simple', options);
          this._log('info', 'Retrying with simple constraints after OverconstrainedError');
          this._log('debug', `Constraints: ${this._stringifyConstraints(simpleConstraints)}`);

          const stream = await this.streamLifecycle!.acquireStream(simpleConstraints, options);

          this._log('info', 'Stream acquired with simple constraints');
          return { stream, strategy: 'full-softened', context };
        } catch (retryError) {
          lastError = retryError;
          const retryLabel = formatErrorLabel(retryError as Error);
          this._log('warn', `Simple constraints retry failed - ${retryLabel}`);
        }
      }
    }

    // Fallback chain - all attempts use ConstraintBuilder with context
    while (this.fallbackStrategy.hasMore()) {
      const fallback = this.fallbackStrategy.getNext();
      if (!fallback) break;

      try {
        currentStrategy = fallback.name;
        this._log('info', `Trying fallback: ${currentStrategy} - ${fallback.description}`);

        const constraints = this.constraintBuilder!.build(context, fallback.detailLevel, {
          audio: fallback.audio,
          video: fallback.video,
          ...options
        });
        this._log('debug', `Constraints: ${this._stringifyConstraints(constraints)}`);

        const stream = await this.streamLifecycle!.acquireStream(constraints, options);

        this._log('info', `Stream acquired with fallback: ${currentStrategy}`);
        return { stream, strategy: currentStrategy, context };

      } catch (error) {
        lastError = error;
        const errLabel = formatErrorLabel(error as Error);
        this._log('warn', `Fallback ${currentStrategy} failed - ${errLabel}`);
      }
    }

    // All attempts failed
    const errorMessage = `Stream acquisition failed after all attempts. Device: ${context.deviceId}. Last error: ${formatErrorLabel(lastError as Error)}`;
    this._log('error', errorMessage);
    throw new Error(errorMessage, { cause: lastError });
  }

  /**
   * @private
   */
  _stringifyConstraints(constraints: unknown) {
    try {
      return JSON.stringify(constraints);
    } catch {
      return String(constraints);
    }
  }

  /**
   * @private
   */
  _log(level: keyof LoggerLike, message: string, ...args: unknown[]) {
    if (this.logger?.[level]) {
      this.logger[level](message, ...args);
    }
  }
}
