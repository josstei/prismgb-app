import { BaseOrchestrator } from '@shared/base/orchestrator.base.js';
import { UpdateState } from '@shared/config/update-state.config';
import type { UpdateStateValue } from '@shared/config/update-state.config.js';
import type { LoggerFactoryLike } from '@shared/interfaces/infrastructure.types.js';
import type {
  UpdateCheckResponse,
  UpdateDownloadResponse,
  UpdateInstallResponse,
  UpdateInfoPayload,
  UpdateStatusPayload
} from '@shared/ipc/preload-api.contract.js';

export type RendererUpdateStatus = UpdateStatusPayload & {
  state: UpdateStateValue;
};

type UpdateServiceLike = {
  readonly state: UpdateStateValue;
  readonly updateInfo: UpdateInfoPayload | null;
  initialize(): Promise<void>;
  getStatus(): RendererUpdateStatus;
  checkForUpdates(): Promise<UpdateCheckResponse>;
  downloadUpdate(): Promise<UpdateDownloadResponse>;
  installUpdate(): Promise<UpdateInstallResponse>;
  dispose(): void;
};

type UpdateUiServiceLike = {
  initialize(): void;
  dispose(): void;
};

type UpdateOrchestratorDependencies = {
  updateService: UpdateServiceLike;
  updateUiService: UpdateUiServiceLike;
  loggerFactory: LoggerFactoryLike;
};

class UpdateOrchestrator extends BaseOrchestrator {
  private readonly updateService: UpdateServiceLike;
  private readonly updateUiService: UpdateUiServiceLike;

  constructor(dependencies: UpdateOrchestratorDependencies) {
    super(
      dependencies,
      ['updateService', 'updateUiService', 'loggerFactory'],
      'UpdateOrchestrator'
    );
    this.updateService = dependencies.updateService;
    this.updateUiService = dependencies.updateUiService;
  }

  async onInitialize(): Promise<void> {
    await this.updateService.initialize();
    this.updateUiService.initialize();
  }

  getStatus(): RendererUpdateStatus {
    return this.updateService.getStatus();
  }

  get state(): UpdateStateValue {
    return this.updateService.state;
  }

  get updateInfo(): UpdateInfoPayload | null {
    return this.updateService.updateInfo;
  }

  async checkForUpdates(): Promise<UpdateCheckResponse> {
    this.logger.info('Checking for updates...');
    return this.updateService.checkForUpdates();
  }

  async downloadUpdate(): Promise<UpdateDownloadResponse> {
    this.logger.info('Downloading update...');
    return this.updateService.downloadUpdate();
  }

  async installUpdate(): Promise<UpdateInstallResponse> {
    this.logger.info('Installing update...');
    return this.updateService.installUpdate();
  }

  async onCleanup(): Promise<void> {
    this.updateService.dispose();
    this.updateUiService.dispose();
  }
}

export { UpdateOrchestrator, UpdateState };
