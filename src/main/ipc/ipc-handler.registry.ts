import { app, ipcMain, shell } from 'electron';
import type { BrowserWindow } from 'electron';
import { injectable, inject } from 'inversify';
import { BaseService, type LoggerFactory } from '@platform/core';
import { createIPCHandler } from 'electron-trpc/main';
import { appRouter } from './router';
import type {
  IpcContext,
  DeviceConnectionPort,
  WindowService,
  LoginItemService,
  TranscodeService
} from './trpc';
import type { AutoUpdateService } from '@main/infrastructure/updates/auto-update.service';
import type { IpcPushBridge } from './ipc-push.bridge';
import { TEST_CONTROL_CHANNELS } from './test-control.port';
import type { MainProcessTestControlPort } from './test-control.port';
import type { DeviceStatusPayload } from '@platform/devices';
import { TOKENS } from '@main/application/di/tokens';

const ELECTRON_TRPC_CHANNEL = 'electron-trpc';

/**
 * Owns the renderer↔main tRPC transport. `registerHandlers` installs the electron-trpc IPC handler
 * for {@link appRouter}; {@link attachWindow} binds the main window so per-frame subscriptions are
 * torn down on navigation/destroy. The per-request {@link IpcContext} supplies the services the
 * router procedures call, plus the {@link IpcPushBridge}.
 */
@injectable()
class IpcHandlerRegistry extends BaseService {
  private handler: ReturnType<typeof createIPCHandler> | null = null;
  private attachedWindow: BrowserWindow | null = null;

  constructor(
    @inject(TOKENS.deviceConnectionService) private readonly deviceConnectionService: DeviceConnectionPort,
    @inject(TOKENS.mainProcessTestControl) private readonly mainProcessTestControl: MainProcessTestControlPort,
    @inject(TOKENS.autoUpdateService) private readonly autoUpdateService: AutoUpdateService,
    @inject(TOKENS.windowService) private readonly windowService: WindowService,
    @inject(TOKENS.transcodeService) private readonly transcodeService: TranscodeService,
    @inject(TOKENS.loginItemService) private readonly loginItemService: LoginItemService,
    @inject(TOKENS.ipcPushBridge) private readonly ipcPushBridge: IpcPushBridge,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactory
  ) {
    super(loggerFactory, 'IpcHandlerRegistry');
  }

  registerHandlers(): void {
    this.logger.info('Registering IPC handlers');
    this.handler = createIPCHandler({
      router: appRouter,
      createContext: async () => this.createContext(),
      windows: []
    });
    this.registerTestControlHandlers();
  }

  attachWindow(window: BrowserWindow): void {
    this.attachedWindow = window;
    this.handler?.attachWindow(window);
  }

  override async dispose(): Promise<void> {
    this.logger.info('Removing IPC handlers');
    // Tear down active subscriptions explicitly rather than relying on the window's `destroyed`
    // event (which may not have fired yet on hot-reload / error-recovery / test teardown). On the
    // normal shutdown path the window is already destroyed and the cleanup has run, so skip it.
    if (this.handler && this.attachedWindow && !this.attachedWindow.isDestroyed()) {
      this.handler.detachWindow(this.attachedWindow);
    }
    ipcMain.removeAllListeners(ELECTRON_TRPC_CHANNEL);
    ipcMain.removeAllListeners(TEST_CONTROL_CHANNELS.SET_DEVICE_STATUS);
    ipcMain.removeAllListeners(TEST_CONTROL_CHANNELS.CLEAR_DEVICE_STATUS);
    ipcMain.removeAllListeners(TEST_CONTROL_CHANNELS.EMIT_PUSH);
    this.handler = null;
    this.attachedWindow = null;
  }

  private registerTestControlHandlers(): void {
    ipcMain.on(TEST_CONTROL_CHANNELS.SET_DEVICE_STATUS, (_event, payload: DeviceStatusPayload) => {
      this.mainProcessTestControl.setDeviceStatusOverride(payload);
    });
    ipcMain.on(TEST_CONTROL_CHANNELS.CLEAR_DEVICE_STATUS, () => {
      this.mainProcessTestControl.setDeviceStatusOverride(null);
    });
    ipcMain.on(TEST_CONTROL_CHANNELS.EMIT_PUSH, (_event, payload: { channel: string; data?: unknown }) => {
      this.mainProcessTestControl.emitPush(payload.channel, payload.data);
    });
  }

  private createContext(): IpcContext {
    return {
      deviceConnectionService: this.deviceConnectionService,
      mainProcessTestControl: this.mainProcessTestControl,
      autoUpdateService: this.autoUpdateService,
      windowService: this.windowService,
      transcodeService: this.transcodeService,
      loginItemService: this.loginItemService,
      app,
      shell,
      logger: this.logger,
      ipcPushBridge: this.ipcPushBridge
    };
  }
}

export { IpcHandlerRegistry };
