/**
 * Update Bridge
 *
 * Coordinates update service initialization and auto-check scheduling.
 */

import { BaseService } from '@shared/base/service.js';

class UpdateBridge extends BaseService {
  constructor(dependencies) {
    super(
      dependencies,
      ['updateService', 'loggerFactory'],
      'UpdateBridge'
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

export { UpdateBridge };
