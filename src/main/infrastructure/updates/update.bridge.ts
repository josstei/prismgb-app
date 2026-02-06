/**
 * Update Bridge
 *
 * Coordinates update service initialization and auto-check scheduling.
 */

import { BaseService } from '@shared/base/service.base.js';

interface UpdateService {
  initialize(): void;
  startAutoCheck(intervalMs: number): void;
  dispose(): void;
}

interface LoggerFactory {
  create(name: string): Logger;
}

interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string | Error, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

interface UpdateBridgeDependencies {
  updateService: UpdateService;
  loggerFactory: LoggerFactory;
}

class UpdateBridge extends BaseService {
  [key: string]: any;

  constructor(dependencies: UpdateBridgeDependencies) {
    super(
      dependencies,
      ['updateService', 'loggerFactory'],
      'UpdateBridge'
    );
  }

  initialize(): void {
    (this.updateService as UpdateService).initialize();
    (this.updateService as UpdateService).startAutoCheck(60 * 60 * 1000);
  }

  dispose(): void {
    (this.updateService as UpdateService).dispose();
  }
}

export { UpdateBridge };
