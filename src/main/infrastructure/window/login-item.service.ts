import { app } from 'electron';
import { BaseService, type LoggerFactoryLike } from '@platform/core';

interface LoginItemServiceDependencies {
  loggerFactory: LoggerFactoryLike;
}

class LoginItemService extends BaseService {

  constructor(dependencies: LoginItemServiceDependencies) {
    super(dependencies, 'LoginItemService');
  }

  setEnabled(enabled: boolean): void {
    const settings = process.platform === 'darwin'
      ? { openAtLogin: enabled, openAsHidden: true }
      : { openAtLogin: enabled, args: ['--hidden'] };

    app.setLoginItemSettings(settings);
    this.logger.info(`Login item ${enabled ? 'enabled' : 'disabled'} (platform: ${process.platform})`);
  }

  isEnabled(): boolean {
    return app.getLoginItemSettings().openAtLogin;
  }

  wasLaunchedAsHidden(): boolean {
    if (process.platform === 'darwin') {
      return app.getLoginItemSettings().wasOpenedAsHidden ?? false;
    }
    return process.argv.includes('--hidden');
  }
}

export { LoginItemService };
