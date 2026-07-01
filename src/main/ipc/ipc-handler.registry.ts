import { app, ipcMain, shell } from 'electron';
import type { BrowserWindow } from 'electron';
import { BaseService, type LoggerFactoryLike } from '@prismgb/core';
import { createIPCHandler } from 'electron-trpc/main';
import { appRouter } from './router.js';
import type {
  IpcContext,
  DeviceConnectionPort,
  UpdateService,
  WindowService,
  LoginItemService,
  TranscodeService
} from './trpc.js';
import type { IpcPushBridge } from './event-bridge.js';
import { TEST_CONTROL_CHANNELS } from './test-control.port.js';
import type { MainProcessTestControlPort } from './test-control.port.js';
import type { DeviceStatusPayload } from '@prismgb/ipc';

const ELECTRON_TRPC_CHANNEL = 'electron-trpc';

export interface IpcHandlerRegistryDependencies {
  deviceConnectionService: DeviceConnectionPort;
  mainProcessTestControl: MainProcessTestControlPort;
  updateService: UpdateService;
  windowService: WindowService;
  transcodeService: TranscodeService;
  loginItemService: LoginItemService;
  ipcPushBridge: IpcPushBridge;
  loggerFactory: LoggerFactoryLike;
}

/**
 * Owns the renderer↔main tRPC transport. `registerHandlers` installs the electron-trpc IPC handler
 * for {@link appRouter}; {@link attachWindow} binds the main window so per-frame subscriptions are
 * torn down on navigation/destroy. The per-request {@link IpcContext} supplies the same dependency
 * set the retired manifest registry injected, plus the {@link IpcPushBridge}.
 */
class IpcHandlerRegistry extends BaseService {
  private readonly deviceConnectionService: DeviceConnectionPort;
  private readonly mainProcessTestControl: MainProcessTestControlPort;
  private readonly updateService: UpdateService;
  private readonly windowService: WindowService;
  private readonly transcodeService: TranscodeService;
  private readonly loginItemService: LoginItemService;
  private readonly ipcPushBridge: IpcPushBridge;
  private handler: ReturnType<typeof createIPCHandler> | null = null;
  private attachedWindow: BrowserWindow | null = null;

  constructor(dependencies: IpcHandlerRegistryDependencies) {
    super(dependencies, 'IpcHandlerRegistry');
    this.deviceConnectionService = dependencies.deviceConnectionService;
    this.mainProcessTestControl = dependencies.mainProcessTestControl;
    this.updateService = dependencies.updateService;
    this.windowService = dependencies.windowService;
    this.transcodeService = dependencies.transcodeService;
    this.loginItemService = dependencies.loginItemService;
    this.ipcPushBridge = dependencies.ipcPushBridge;
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

  dispose(): void {
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
      updateService: this.updateService,
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
