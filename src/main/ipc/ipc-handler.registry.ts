import type { IpcMainInvokeEvent } from 'electron';
import { app, ipcMain, shell } from 'electron';
import type { LoggerFactory } from '@main/infrastructure/logging/logger.interface.js';
import { BaseService } from '@prismgb/core';
import type {
  DeviceStatusPayload,
  TranscodeCancelResponse,
  TranscodeStartResponse,
  TranscodeStatusResponse,
  UpdateStatusPayload
} from '@prismgb/ipc';
import { IpcContractManifest } from '@prismgb/ipc';
import { defineIpcHandlerRegistrationGroup, type IpcHandlerRegistrationGroup, type IpcHandlerDescriptor, registerIpcHandlerRegistrationGroups } from './ipc-handler.descriptor.js';
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

const handlerRegistrationGroupDefinitions = [
  defineIpcHandlerRegistrationGroup('deviceAPI', deviceHandlerDescriptors),
  defineIpcHandlerRegistrationGroup('shellAPI', shellHandlerDescriptors),
  defineIpcHandlerRegistrationGroup('updateAPI', updateHandlerDescriptors),
  defineIpcHandlerRegistrationGroup('metricsAPI', performanceHandlerDescriptors),
  defineIpcHandlerRegistrationGroup('windowAPI', windowHandlerDescriptors),
  defineIpcHandlerRegistrationGroup('transcodeAPI', transcodeHandlerDescriptors),
  defineIpcHandlerRegistrationGroup('gpuAPI', gpuHandlerDescriptors),
  defineIpcHandlerRegistrationGroup('loginItemAPI', loginItemHandlerDescriptors)
] as const;

const handlerRegistrationGroupsByApiName = new Map(
  handlerRegistrationGroupDefinitions.map((group) => [group.apiName, group])
);

function createIpcHandlerRegistrationGroups() {
  const manifestInvokeNamespaces = IpcContractManifest.namespaces.filter(({ invoke }) => (invoke || []).length > 0);
  const manifestInvokeApiNames = manifestInvokeNamespaces.map(({ apiName }) => apiName);
  const manifestInvokeApiNameSet = new Set(manifestInvokeApiNames);
  const extraApiNames = handlerRegistrationGroupDefinitions.map(({ apiName }) => apiName).filter((apiName) => !manifestInvokeApiNameSet.has(apiName));
  if (extraApiNames.length > 0) throw new Error(`IPC handler descriptor API names not declared in manifest: ${extraApiNames.join(', ')}`);
  return manifestInvokeNamespaces.map(({ apiName, invoke }) => {
    const registrationGroup = handlerRegistrationGroupsByApiName.get(apiName);
    if (!registrationGroup) throw new Error(`IPC handler descriptors missing for manifest API "${apiName}"`);
    const { descriptors } = registrationGroup;
    const manifestChannels = invoke.map(({ channel }) => channel);
    const descriptorByChannel = new Map<string, IpcHandlerDescriptor<Record<string, unknown>>>(), duplicateChannels = [];
    for (const descriptor of descriptors) {
      if (descriptorByChannel.has(descriptor.channel)) duplicateChannels.push(descriptor.channel);
      descriptorByChannel.set(descriptor.channel, descriptor);
    }
    const manifestChannelSet = new Set(manifestChannels);
    const missingChannels = manifestChannels.filter((channel) => !descriptorByChannel.has(channel));
    const extraChannels = descriptors.map(({ channel }) => channel).filter((channel) => !manifestChannelSet.has(channel));
    const failures = [
      missingChannels.length ? `missing channels ${missingChannels.join(', ')}` : '',
      extraChannels.length ? `extra channels ${extraChannels.join(', ')}` : '',
      duplicateChannels.length ? `duplicate channels ${duplicateChannels.join(', ')}` : ''
    ].filter(Boolean);
    if (failures.length > 0) throw new Error(`IPC handler descriptors for ${apiName} do not match manifest: ${failures.join('; ')}`);
    return { apiName, descriptors: manifestChannels.map((channel) => descriptorByChannel.get(channel)!) } satisfies IpcHandlerRegistrationGroup;
  });
}

const IpcHandlerRegistrationGroups = createIpcHandlerRegistrationGroups();

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
    super(dependencies, 'IpcHandlerRegistry');
    this.deviceService = dependencies.deviceService;
    this.updateService = dependencies.updateService;
    this.windowService = dependencies.windowService;
    this.transcodeService = dependencies.transcodeService;
    this.loginItemService = dependencies.loginItemService;
    this._registeredChannels = [];
    this._registeredChannelsSet = new Set<string>();
  }

  registerHandlers(): void {
    this.logger.info('Registering IPC handlers');
    registerIpcHandlerRegistrationGroups(this._registerHandler.bind(this), {
      deviceService: this.deviceService,
      updateService: this.updateService,
      windowService: this.windowService,
      transcodeService: this.transcodeService,
      loginItemService: this.loginItemService,
      app,
      shell,
      logger: this.logger
    }, IpcHandlerRegistrationGroups);
  }

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
