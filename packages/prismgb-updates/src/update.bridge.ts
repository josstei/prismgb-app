/**
 * Update Bridge
 *
 * Coordinates update service initialization and auto-check scheduling.
 */

import { BaseService } from '@prismgb/core';

interface UpdateService {
  initialize(): void;
  startAutoCheck(intervalMs: number): void;
  dispose(): void | Promise<void>;
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
  private readonly updateService: UpdateService;

  constructor(dependencies: UpdateBridgeDependencies) {
    super(
      dependencies,
      'UpdateBridge'
    );
    this.updateService = dependencies.updateService;
  }

  initialize(): void {
    this.updateService.initialize();
    this.updateService.startAutoCheck(60 * 60 * 1000);
  }

  async dispose(): Promise<void> {
    await this.updateService.dispose();
    await super.dispose();
  }
}

export { UpdateBridge };
