/**
 * Update Orchestrator
 *
 * Coordinates update service initialization and update actions.
 *
 * Responsibilities:
 * - Initialize UpdateService
 * - Provide facade for update actions
 */

import { BaseOrchestrator } from '@shared/base/orchestrator.base.js';
import { UpdateState } from './update.service.js';

class UpdateOrchestrator extends BaseOrchestrator {
  constructor(dependencies) {
    super(
      dependencies,
      ['updateService', 'updateUiService', 'loggerFactory'],
      'UpdateOrchestrator'
    );
  }

  async onInitialize() {
    await this.updateService.initialize();
    this.updateUiService.initialize();
  }

  getStatus() {
    return this.updateService.getStatus();
  }

  get state() {
    return this.updateService.state;
  }

  get updateInfo() {
    return this.updateService.updateInfo;
  }

  async checkForUpdates() {
    this.logger.info('Checking for updates...');
    return this.updateService.checkForUpdates();
  }

  async downloadUpdate() {
    this.logger.info('Downloading update...');
    return this.updateService.downloadUpdate();
  }

  async installUpdate() {
    this.logger.info('Installing update...');
    return this.updateService.installUpdate();
  }

  async onCleanup() {
    this.updateService.dispose();
    this.updateUiService.dispose();
  }
}

export { UpdateOrchestrator, UpdateState };
