/**
 * Update Bridge Service
 *
 * Coordinates update service initialization and auto-check scheduling.
 */

import { BaseService } from '@shared/base/service.js';

class UpdateBridgeService extends BaseService {
  constructor(dependencies) {
    super(
      dependencies,
      ['updateService', 'loggerFactory'],
      'UpdateBridgeService'
    );
  }

  initialize() {
    this.updateService.initialize();
    this.updateService.startAutoCheck(60 * 60 * 1000);
  }

  dispose() {
    this.updateService.dispose();
  }
}

export { UpdateBridgeService };
