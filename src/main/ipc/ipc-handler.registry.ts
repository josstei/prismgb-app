import { ipcMain, shell } from 'electron';
import type { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';

import { BaseService, type LoggerFactoryLike } from '@platform/core';
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
import type { IpcPushBridge } from './ipc-push.bridge.js';
import { TEST_CONTROL_CHANNELS } from './test-control.port.js';
import type { MainProcessTestControlPort } from './test-control.port.js';
import { IPC_CHANNELS, type DeviceStatusPayload } from '@platform/ipc';
import type { RendererShutdownResult } from './schemas/app.schemas.js';

const ELECTRON_TRPC_CHANNEL = 'electron-trpc';
const RENDERER_SHUTDOWN_TIMEOUT_MS = 30_000;

/**
 * Owns the renderer↔main tRPC transport. `registerHandlers` installs the electron-trpc IPC handler
 * for {@link appRouter}; {@link attachWindow} binds the main window so per-frame subscriptions are
 * torn down on navigation/destroy. Renderer shutdown is acknowledged before main services and
 * this transport are disposed, allowing notes and recording buffers to finish saving.
 */
type IpcHandlerRegistryDependencies = {
  deviceConnectionService: DeviceConnectionPort;
  mainProcessTestControl: MainProcessTestControlPort;
  updateService: UpdateService;
  windowService: WindowService;
  transcodeService: TranscodeService;
  loginItemService: LoginItemService;
  ipcPushBridge: IpcPushBridge;
  loggerFactory: LoggerFactoryLike;
  onRendererReady: () => void;
};

class IpcHandlerRegistry extends BaseService {
  private handler: ReturnType<typeof createIPCHandler> | null = null;
  private attachedWindow: BrowserWindow | null = null;
  private detachWindowListeners: (() => void) | null = null;
  private rendererReady = false;
  private rendererFailure: Error | null = null;
  private rendererShutdown: Promise<void> | null = null;
  private pendingShutdown: {
    requestId: string;
    resolve: () => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  } | null = null;

  private readonly deviceConnectionService: DeviceConnectionPort;
  private readonly mainProcessTestControl: MainProcessTestControlPort;
  private readonly updateService: UpdateService;
  private readonly windowService: WindowService;
  private readonly transcodeService: TranscodeService;
  private readonly loginItemService: LoginItemService;
  private readonly ipcPushBridge: IpcPushBridge;
  private readonly onRendererReady: () => void;

  constructor({ deviceConnectionService, mainProcessTestControl, updateService, windowService, transcodeService, loginItemService, ipcPushBridge, loggerFactory, onRendererReady }: IpcHandlerRegistryDependencies) {
    super({ loggerFactory }, 'IpcHandlerRegistry');
    this.deviceConnectionService = deviceConnectionService;
    this.mainProcessTestControl = mainProcessTestControl;
    this.updateService = updateService;
    this.windowService = windowService;
    this.transcodeService = transcodeService;
    this.loginItemService = loginItemService;
    this.ipcPushBridge = ipcPushBridge;
    this.onRendererReady = onRendererReady;
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
    this.detachWindowListeners?.();
    this.attachedWindow = window;
    const rendererGone = () => this.failRendererShutdown(new Error('Renderer exited before shutdown completed'));
    const navigationStarted = ({ isMainFrame, isSameDocument }: { isMainFrame: boolean; isSameDocument: boolean }) => {
      if (!isMainFrame || isSameDocument) return;
      this.rendererReady = false;
      if (this.pendingShutdown) {
        this.failRendererShutdown(new Error('Renderer navigated during shutdown'));
      } else {
        this.rendererFailure = null;
        this.rendererShutdown = null;
      }
    };
    window.webContents.on('render-process-gone', rendererGone);
    window.webContents.on('destroyed', rendererGone);
    window.webContents.on('did-start-navigation', navigationStarted);
    this.detachWindowListeners = () => {
      window.webContents.off('render-process-gone', rendererGone);
      window.webContents.off('destroyed', rendererGone);
      window.webContents.off('did-start-navigation', navigationStarted);
    };
    this.handler?.attachWindow(window);
  }

  shutdownRenderer(): Promise<void> {
    if (this.rendererShutdown) return this.rendererShutdown;
    if (!this.rendererReady) return Promise.resolve();
    if (this.rendererFailure) return Promise.reject(this.rendererFailure);

    const requestId = randomUUID();
    this.rendererShutdown = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.failRendererShutdown(new Error('Renderer shutdown timed out'));
      }, RENDERER_SHUTDOWN_TIMEOUT_MS);
      this.pendingShutdown = { requestId, resolve, reject, timeout };
    });
    try {
      this.ipcPushBridge.emit(IPC_CHANNELS.APP.SHUTDOWN_REQUESTED, { requestId });
    } catch (error) {
      this.failRendererShutdown(error instanceof Error ? error : new Error(String(error)));
    }
    return this.rendererShutdown;
  }

  private completeRendererShutdown({ requestId, error }: RendererShutdownResult): void {
    const pending = this.pendingShutdown;
    if (!pending || pending.requestId !== requestId) return;
    clearTimeout(pending.timeout);
    this.pendingShutdown = null;
    if (error) pending.reject(new Error(`Renderer shutdown failed: ${error}`));
    else pending.resolve();
  }

  private failRendererShutdown(error: Error): void {
    this.rendererFailure = error;
    const pending = this.pendingShutdown;
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingShutdown = null;
    pending.reject(error);
  }

  dispose(): void {
    this.logger.info('Removing IPC handlers');
    if (this.pendingShutdown) {
      this.failRendererShutdown(new Error('IPC transport disposed before renderer shutdown completed'));
    }
    this.detachWindowListeners?.();
    this.detachWindowListeners = null;
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
      shell,
      logger: this.logger,
      ipcPushBridge: this.ipcPushBridge,
      onRendererReady: () => {
        this.rendererReady = true;
        this.rendererFailure = null;
        this.onRendererReady();
      },
      onRendererShutdownComplete: (result) => this.completeRendererShutdown(result)
    };
  }
}

export { IpcHandlerRegistry };
