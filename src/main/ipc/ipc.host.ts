import { app, ipcMain, shell } from 'electron';
import type { BrowserWindow } from 'electron';
import { injectable, inject } from 'inversify';
import { createIPCHandler, ELECTRON_TRPC_CHANNEL } from 'electron-trpc/main';
import { BaseService, type LoggerFactory } from '@platform/core';
import { TOKENS } from '@main/application/di/tokens';
import type { DeviceConnectionService } from '@main/infrastructure/devices/device-connection.service';
import type { AutoUpdateService } from '@main/infrastructure/updates/auto-update.service';
import type { TranscodeService } from '@main/infrastructure/transcode/transcode.service';
import type { WindowService } from '@main/infrastructure/window/window.service';
import type { LoginItemService } from '@main/infrastructure/system/login-item.service';
import { appRouter } from './router';
import { installTestControl, type TestControl } from './test-control';
import type { IpcContext } from './trpc';
import type { IpcPushBridge } from './ipc-push.bridge';

/** Owns the renderer-to-main tRPC transport and the main window it serves. */
@injectable()
export class IpcHost extends BaseService {
  private handler: ReturnType<typeof createIPCHandler> | null = null;
  private attachedWindow: BrowserWindow | null = null;
  private testControl: TestControl | null = null;

  constructor(
    @inject(TOKENS.deviceConnectionService) private readonly deviceConnectionService: DeviceConnectionService,
    @inject(TOKENS.autoUpdateService) private readonly autoUpdateService: AutoUpdateService,
    @inject(TOKENS.windowService) private readonly windowService: WindowService,
    @inject(TOKENS.transcodeService) private readonly transcodeService: TranscodeService,
    @inject(TOKENS.loginItemService) private readonly loginItemService: LoginItemService,
    @inject(TOKENS.ipcPushBridge) private readonly ipcPushBridge: IpcPushBridge,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactory
  ) {
    super(loggerFactory, 'IpcHost');
  }

  registerHandlers(): void {
    this.logger.info('Registering IPC handlers');
    this.testControl = installTestControl(this.ipcPushBridge);
    const context: IpcContext = {
      deviceConnectionService: this.deviceConnectionService,
      autoUpdateService: this.autoUpdateService,
      windowService: this.windowService,
      transcodeService: this.transcodeService,
      loginItemService: this.loginItemService,
      app,
      shell,
      logger: this.logger,
      ipcPushBridge: this.ipcPushBridge,
      testControl: this.testControl
    };
    this.handler = createIPCHandler({
      router: appRouter,
      createContext: async () => context,
      windows: []
    });
  }

  attachWindow(window: BrowserWindow): void {
    this.attachedWindow = window;
    this.handler?.attachWindow(window);
  }

  override async dispose(): Promise<void> {
    this.logger.info('Removing IPC handlers');
    // Subscriptions are torn down here rather than on the window's `destroyed` event, which may not
    // have fired yet; on the normal shutdown path the window is already destroyed and cleaned up.
    if (this.handler && this.attachedWindow && !this.attachedWindow.isDestroyed()) {
      this.handler.detachWindow(this.attachedWindow);
    }
    ipcMain.removeAllListeners(ELECTRON_TRPC_CHANNEL);
    this.testControl?.dispose();
    this.testControl = null;
    this.handler = null;
    this.attachedWindow = null;
    await super.dispose();
  }
}
