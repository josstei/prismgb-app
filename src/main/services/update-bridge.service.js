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
      ['updateServiceMain', 'loggerFactory'],
      'UpdateBridgeService'
    );
  }

  initialize() {
    this.updateServiceMain.initialize();
    this.updateServiceMain.startAutoCheck(60 * 60 * 1000);
  }

  dispose() {
    this.updateServiceMain.dispose();
  }
}

export { UpdateBridgeService };
