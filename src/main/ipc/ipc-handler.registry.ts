import { app, ipcMain, shell } from 'electron';
import type { BrowserWindow } from 'electron';
import { BaseService, type LoggerFactoryLike } from '@prismgb/core';
import { createIPCHandler } from 'electron-trpc/main';
import { appRouter } from './router.js';
import type {
  IpcContext,
  DeviceService,
  UpdateService,
  WindowService,
  LoginItemService,
  TranscodeService
} from './trpc.js';
import type { IpcPushBridge } from './event-bridge.js';

const ELECTRON_TRPC_CHANNEL = 'electron-trpc';

export interface IpcHandlerRegistryDependencies {
  deviceService: DeviceService;
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
  private readonly deviceService: DeviceService;
  private readonly updateService: UpdateService;
  private readonly windowService: WindowService;
  private readonly transcodeService: TranscodeService;
  private readonly loginItemService: LoginItemService;
  private readonly ipcPushBridge: IpcPushBridge;
  private handler: ReturnType<typeof createIPCHandler> | null = null;

  constructor(dependencies: IpcHandlerRegistryDependencies) {
    super(dependencies, 'IpcHandlerRegistry');
    this.deviceService = dependencies.deviceService;
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
  }

  attachWindow(window: BrowserWindow): void {
    this.handler?.attachWindow(window);
  }

  dispose(): void {
    this.logger.info('Removing IPC handlers');
    ipcMain.removeAllListeners(ELECTRON_TRPC_CHANNEL);
    this.handler = null;
  }

  private createContext(): IpcContext {
    return {
      deviceService: this.deviceService,
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
