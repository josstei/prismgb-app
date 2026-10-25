import { createMainRuntime, type MainRuntime, type MainRuntimeOptions } from './application/container.js';
import { MainLogger } from './infrastructure/logging/logger.factory.js';

export class MainBootstrap {
  private runtime: MainRuntime | null = null;
  private readonly loggerFactory = new MainLogger();

  constructor(private readonly options: MainRuntimeOptions = {}) {}

  initialize(): Promise<void> {
    this.runtime ??= createMainRuntime(this.loggerFactory, this.options);
    return this.runtime.initialize();
  }

  async cleanup(): Promise<void> {
    const runtime = this.runtime;
    try {
      await runtime?.dispose();
    } finally {
      if (this.runtime === runtime) this.runtime = null;
    }
  }

  getRuntime(): MainRuntime | null {
    return this.runtime;
  }
}
