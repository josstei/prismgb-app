import { app } from 'electron';
import { injectable, inject } from 'inversify';
import { BaseService, type LoggerFactoryLike } from '@platform/core';
import { TOKENS } from '@main/application/di/tokens.js';

@injectable()
class LoginItemService extends BaseService {

  constructor(@inject(TOKENS.loggerFactory) loggerFactory: LoggerFactoryLike) {
    super({ loggerFactory }, 'LoginItemService');
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
