/**
 * Device Bridge Service
 *
 * Bridges device connection events to tray updates and renderer IPC.
 */

import { BaseService } from '@shared/base/service.js';
import IPC_CHANNELS from '@infrastructure/ipc/channels.js';

class DeviceBridgeService extends BaseService {
  constructor(dependencies) {
    super(
      dependencies,
      ['deviceServiceMain', 'trayManager', 'windowManager', 'loggerFactory'],
      'DeviceBridgeService'
    );

    this._connectionChangedHandler = null;
  }

  initialize() {
    if (this._connectionChangedHandler) {
      return;
    }

    this._connectionChangedHandler = () => {
      this.trayManager.updateTrayMenu();

      if (this.deviceServiceMain.isConnected()) {
        this.windowManager.send(IPC_CHANNELS.DEVICE.CONNECTED, this.deviceServiceMain.connectedDeviceInfo);
      } else {
        this.windowManager.send(IPC_CHANNELS.DEVICE.DISCONNECTED);
      }
    };

    this.deviceServiceMain.on('connection-changed', this._connectionChangedHandler);
  }

  dispose() {
    if (this._connectionChangedHandler) {
      this.deviceServiceMain.off('connection-changed', this._connectionChangedHandler);
      this._connectionChangedHandler = null;
    }
  }
}

export { DeviceBridgeService };
