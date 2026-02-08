import { app } from 'electron';
import { BaseService } from '@shared/base/service.base.js';

interface LoginItemServiceDependencies {
  loggerFactory: {
    create: (name: string) => {
      info: (message: string) => void;
      debug: (message: string) => void;
      warn: (message: string) => void;
      error: (message: string) => void;
    };
  };
}

class LoginItemService extends BaseService {

  constructor(dependencies: LoginItemServiceDependencies) {
    super(dependencies, ['loggerFactory'], 'LoginItemService');
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
export type { LoginItemServiceDependencies };
