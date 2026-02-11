import { LifecycleService } from './lifecycle-service.base.ts';

export class BaseOrchestrator extends LifecycleService {
  constructor(dependencies, requiredDeps, name) {
    super(dependencies, requiredDeps, name);
    this._orchestratorName = name || this.constructor.name;
  }

  async cleanup() {
    await this.dispose();
  }

  async onCleanup() {
    // Override in subclasses
  }

  async onDispose() {
    await this.onCleanup();
  }
}
