import { validateDependencies } from './validate-deps.utils';
import type { ILogger, ILoggerFactory } from '../interfaces/infrastructure/logger.interface';

export type { ILogger, ILoggerFactory };

/**
 * Dependencies object type for BaseService.
 */
export interface BaseServiceDependencies {
  loggerFactory?: ILoggerFactory;
  [key: string]: unknown;
}

/**
 * Base class for all services providing:
 * - Dependency injection and validation
 * - Logger creation and management
 */
export class BaseService {
  protected logger?: ILogger;
  protected readonly _serviceName: string;

  /**
   * Create a new service
   * @param dependencies - Dependency injection object
   * @param requiredDeps - Array of required dependency names
   * @param serviceName - Name of the service (for logging)
   */
  constructor(
    dependencies: BaseServiceDependencies,
    requiredDeps: string[] = [],
    serviceName: string | null = null
  ) {
    const name = serviceName ?? this.constructor.name;
    validateDependencies(dependencies, requiredDeps, name);

    // Explicitly assign only required dependencies
    for (const dep of requiredDeps) {
      (this as any)[dep] = dependencies[dep];
    }

    // Create logger if loggerFactory provided
    if (dependencies.loggerFactory) {
      this.logger = dependencies.loggerFactory.create(name);
    }

    this._serviceName = name;
  }
}
