/**
 * Device Bridge
 *
 * Bridges device connection events to tray updates and renderer IPC.
 */

import { BaseService } from '@shared/base/service.base.js';
import { channels as IPC_CHANNELS } from '@shared/ipc/channels.config.js';
import { MainEventChannels } from '@main/infrastructure/events/event-channels.config.js';

class DeviceBridgeService extends BaseService {
  constructor(dependencies) {
    super(
      dependencies,
      ['deviceService', 'trayService', 'windowService', 'eventBus', 'loggerFactory'],
      'DeviceBridgeService'
    );

    this._unsubscribe = null;
  }

  initialize() {
    if (this._unsubscribe) {
      return;
    }

    this._unsubscribe = this.eventBus.subscribe(
      MainEventChannels.DEVICE.CONNECTION_CHANGED,
      (status) => this._handleConnectionChanged(status)
    );
  }

  _handleConnectionChanged(status) {
    this.trayService.updateTrayMenu();

    if (status.connected) {
      this.windowService.send(IPC_CHANNELS.DEVICE.CONNECTED, status.device);
    } else {
      this.windowService.send(IPC_CHANNELS.DEVICE.DISCONNECTED);
    }
  }

  dispose() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  }
}

export { DeviceBridgeService };
