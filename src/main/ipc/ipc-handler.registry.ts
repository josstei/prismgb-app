/**
 * IPC Handler Registry
 * Centralized registration of all IPC handler modules.
 */

import type { IpcMainInvokeEvent } from 'electron';
import { app, ipcMain, shell } from 'electron';
import type { LoggerFactory } from '@main/infrastructure/logging/logger.interface.js';
import { BaseService } from '@shared/base/service.base.js';
import type {
  DeviceStatusPayload,
  TranscodeCancelResponse,
  TranscodeStartResponse,
  TranscodeStatusResponse,
  UpdateStatusPayload
} from '@shared/ipc/preload-api.contract.js';
import { registerIpcHandlerDescriptors } from './ipc-handler.descriptor.js';
import {
  deviceHandlerDescriptors,
  updateHandlerDescriptors,
  shellHandlerDescriptors,
  performanceHandlerDescriptors,
  windowHandlerDescriptors,
  transcodeHandlerDescriptors,
  gpuHandlerDescriptors,
  loginItemHandlerDescriptors
} from './handlers/index.js';

interface DeviceService {
  getStatus(): DeviceStatusPayload;
}

interface UpdateService {
  checkForUpdates(): Promise<Record<string, unknown>>;
  downloadUpdate(): Promise<void>;
  installUpdate(): void;
  getStatus(): UpdateStatusPayload;
}

interface WindowService {
  setFullScreen(enabled: boolean): void;
  isFullScreen(): boolean;
}

interface LoginItemService {
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
}

interface TranscodeService {
  transcode(options: {
    inputBuffer: Buffer;
    format: string;
    outputFilename?: string;
    inputArgs?: string[];
    interrupted: boolean;
  }): Promise<TranscodeStartResponse>;
  cancel(jobId: string): TranscodeCancelResponse;
  getStatus(): TranscodeStatusResponse;
}

export interface IpcHandlerRegistryDependencies {
  deviceService: DeviceService;
  updateService: UpdateService;
  windowService: WindowService;
  transcodeService: TranscodeService;
  loginItemService: LoginItemService;
  loggerFactory: LoggerFactory;
}

class IpcHandlerRegistry extends BaseService {

  private readonly deviceService: DeviceService;
  private readonly updateService: UpdateService;
  private readonly windowService: WindowService;
  private readonly transcodeService: TranscodeService;
  private readonly loginItemService: LoginItemService;
  private _registeredChannels: string[];
  private readonly _registeredChannelsSet: Set<string>;

  constructor(dependencies: IpcHandlerRegistryDependencies) {
    super(dependencies, ['deviceService', 'updateService', 'windowService', 'transcodeService', 'loginItemService', 'loggerFactory'], 'IpcHandlerRegistry');
    this.deviceService = dependencies.deviceService;
    this.updateService = dependencies.updateService;
    this.windowService = dependencies.windowService;
    this.transcodeService = dependencies.transcodeService;
    this.loginItemService = dependencies.loginItemService;
    this._registeredChannels = [];
    this._registeredChannelsSet = new Set<string>();
  }

  /**
   * Register all IPC handlers
   */
  registerHandlers(): void {
    this.logger.info('Registering IPC handlers');
    const registerHandler = this._registerHandler.bind(this);

    registerIpcHandlerDescriptors(registerHandler, {
      deviceService: this.deviceService,
      logger: this.logger
    }, deviceHandlerDescriptors);

    registerIpcHandlerDescriptors(registerHandler, {
      shell,
      logger: this.logger
    }, shellHandlerDescriptors);

    registerIpcHandlerDescriptors(registerHandler, {
      updateService: this.updateService,
      logger: this.logger
    }, updateHandlerDescriptors);

    registerIpcHandlerDescriptors(registerHandler, {
      app,
      logger: this.logger
    }, performanceHandlerDescriptors);

    registerIpcHandlerDescriptors(registerHandler, {
      windowService: this.windowService,
      logger: this.logger
    }, windowHandlerDescriptors);

    registerIpcHandlerDescriptors(registerHandler, {
      transcodeService: this.transcodeService,
      logger: this.logger
    }, transcodeHandlerDescriptors);

    registerIpcHandlerDescriptors(registerHandler, {
      logger: this.logger
    }, gpuHandlerDescriptors);

    registerIpcHandlerDescriptors(registerHandler, {
      loginItemService: this.loginItemService,
      logger: this.logger
    }, loginItemHandlerDescriptors);
  }

  /**
   * Remove all registered IPC handlers
   */
  dispose(): void {
    this.logger.info('Removing IPC handlers');
    [...this._registeredChannels].forEach(channel => {
      ipcMain.removeHandler(channel);
    });
    this._registeredChannels = [];
    this._registeredChannelsSet.clear();
  }

  private _registerHandler(channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown> | unknown): void {
    if (this._registeredChannelsSet.has(channel)) {
      throw new Error(`Duplicate IPC channel registration for ${channel}`);
    }

    ipcMain.handle(channel, handler);
    this._registeredChannels.push(channel);
    this._registeredChannelsSet.add(channel);
  }
}

export { IpcHandlerRegistry };
