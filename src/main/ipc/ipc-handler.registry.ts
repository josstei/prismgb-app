/**
 * IPC Handler Registry
 * Centralized registration of all IPC handler modules.
 */

import type { IpcMainInvokeEvent } from 'electron';
import { app, ipcMain, shell } from 'electron';
import type { Logger, LoggerFactory } from '@main/infrastructure/logging/logger.interface.js';
import { BaseService } from '@shared/base/service.base.js';
import {
  registerDeviceHandlers,
  registerUpdateHandlers,
  registerShellHandlers,
  registerPerformanceHandlers,
  registerWindowHandlers,
  registerTranscodeHandlers,
  registerGpuHandlers
} from './handlers/index.js';

interface DeviceService {
  getStatus(): { connected: boolean; error?: string };
}

interface UpdateService {
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<void>;
  installUpdate(): void;
  getStatus(): unknown;
}

interface WindowService {
  setFullScreen(enabled: boolean): void;
  isFullScreen(): boolean;
}

interface TranscodeService {
  transcode(options: {
    inputBuffer: Buffer;
    format: string;
    outputFilename?: string;
    inputArgs?: string[];
    interrupted: boolean;
  }): Promise<unknown>;
  cancel(jobId: string): unknown;
  getStatus(jobId?: string): unknown;
}

export interface IpcHandlerRegistryDependencies {
  deviceService: DeviceService;
  updateService: UpdateService;
  windowService: WindowService;
  transcodeService: TranscodeService;
  loggerFactory: LoggerFactory;
}

class IpcHandlerRegistry extends BaseService {
  private readonly deviceService: DeviceService;
  private readonly updateService: UpdateService;
  private readonly windowService: WindowService;
  private readonly transcodeService: TranscodeService;
  protected readonly logger: Logger;
  private _registeredChannels: string[];

  constructor(dependencies: IpcHandlerRegistryDependencies) {
    super(dependencies, ['deviceService', 'updateService', 'windowService', 'transcodeService', 'loggerFactory'], 'IpcHandlerRegistry');
    this.deviceService = dependencies.deviceService;
    this.updateService = dependencies.updateService;
    this.windowService = dependencies.windowService;
    this.transcodeService = dependencies.transcodeService;
    this.logger = dependencies.loggerFactory.create('IpcHandlerRegistry');
    this._registeredChannels = [];
  }

  /**
   * Register all IPC handlers
   */
  registerHandlers(): void {
    this.logger.info('Registering IPC handlers');

    registerDeviceHandlers({
      registerHandler: this._registerHandler.bind(this),
      deviceService: this.deviceService,
      logger: this.logger
    });

    registerShellHandlers({
      registerHandler: this._registerHandler.bind(this),
      shell,
      logger: this.logger
    });

    registerUpdateHandlers({
      registerHandler: this._registerHandler.bind(this),
      updateService: this.updateService,
      logger: this.logger
    });

    registerPerformanceHandlers({
      registerHandler: this._registerHandler.bind(this),
      app,
      logger: this.logger
    });

    registerWindowHandlers({
      registerHandler: this._registerHandler.bind(this),
      windowService: this.windowService,
      logger: this.logger
    });

    registerTranscodeHandlers({
      registerHandler: this._registerHandler.bind(this),
      transcodeService: this.transcodeService,
      logger: this.logger
    });

    registerGpuHandlers({
      registerHandler: this._registerHandler.bind(this),
      logger: this.logger
    });
  }

  /**
   * Remove all registered IPC handlers
   */
  dispose(): void {
    this.logger.info('Removing IPC handlers');
    this._registeredChannels.forEach(channel => {
      ipcMain.removeHandler(channel);
    });
    this._registeredChannels = [];
  }

  private _registerHandler(channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown> | unknown): void {
    ipcMain.handle(channel, handler);
    this._registeredChannels.push(channel);
  }
}

export { IpcHandlerRegistry };
