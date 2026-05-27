import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { EventChannels } from '@shared/events/event-channels.js';
import { UpdateState } from '@shared/config/update-state.config';
import type { UpdateStateValue } from '@shared/config/update-state.config.js';
import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';

type Unsubscribe = () => void;

type LoggerLike = {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

type LoggerFactoryLike = {
  create(name: string): LoggerLike;
};

type EventBusLike = {
  subscribe(event: string, handler: (payload?: unknown) => void): Unsubscribe;
  publish(event: string, data?: unknown): void;
};

type UpdateInfo = {
  version?: string;
};

type UpdateStatus = {
  state: UpdateStateValue;
  updateInfo?: UpdateInfo | null;
};

type UpdateProgress = {
  percent?: number;
};

const updateStateValues = new Set<string>(Object.values(UpdateState));

function isUpdateStatus(status: unknown): status is UpdateStatus {
  if (typeof status !== 'object' || status === null) {
    return false;
  }

  const state = (status as { state?: unknown }).state;
  return typeof state === 'string' && updateStateValues.has(state);
}

type UpdateOrchestratorLike = {
  getStatus(): UpdateStatus;
  checkForUpdates(): Promise<unknown> | unknown;
  downloadUpdate(): Promise<unknown> | unknown;
  installUpdate(): Promise<unknown> | unknown;
};

type ButtonElementLike = HTMLElement & {
  disabled: boolean;
};

export interface UpdateSectionElements {
  section?: HTMLElement | null;
  currentVersion?: HTMLElement | null;
  statusIndicator?: HTMLElement | null;
  statusText?: HTMLElement | null;
  progressContainer?: HTMLElement | null;
  progressFill?: HTMLElement | null;
  progressText?: HTMLElement | null;
  actionBtn?: ButtonElementLike | null;
  badge?: HTMLElement | null;
}

type CachedUpdateSectionElements = {
  section: HTMLElement | null;
  currentVersion: HTMLElement | null;
  statusIndicator: HTMLElement | null;
  statusText: HTMLElement | null;
  progressContainer: HTMLElement | null;
  progressFill: HTMLElement | null;
  progressText: HTMLElement | null;
  actionBtn: ButtonElementLike | null;
  badge: HTMLElement | null;
};

function createEmptyUpdateSectionElements(): CachedUpdateSectionElements {
  return {
    section: null,
    currentVersion: null,
    statusIndicator: null,
    statusText: null,
    progressContainer: null,
    progressFill: null,
    progressText: null,
    actionBtn: null,
    badge: null
  };
}

export interface UpdateSectionComponentOptions {
  updateOrchestrator: UpdateOrchestratorLike;
  eventBus: EventBusLike;
  loggerFactory?: LoggerFactoryLike | null;
}

class UpdateSectionComponent extends PresentationComponent {
  private readonly updateOrchestrator: UpdateOrchestratorLike;
  private readonly eventBus: EventBusLike;
  private readonly logger: LoggerLike;
  private _initialized: boolean;
  elements: CachedUpdateSectionElements;

  constructor({ updateOrchestrator, eventBus, loggerFactory }: UpdateSectionComponentOptions) {
    super();

    this.updateOrchestrator = updateOrchestrator;
    this.eventBus = eventBus;
    this.logger = loggerFactory?.create('UpdateSectionComponent') || console;

    this._initialized = false;
    this.elements = createEmptyUpdateSectionElements();
  }

  initialize(elements?: UpdateSectionElements | null): void {
    if (this._initialized) {
      this.logger.warn('UpdateSectionComponent already initialized');
      return;
    }

    this._cacheElements(elements);
    this._bindEvents();
    this._subscribeToEvents();
    this._loadInitialState();

    this._initialized = true;
    this.logger.info('UpdateSectionComponent initialized');
  }

  private _cacheElements(elements?: UpdateSectionElements | null): void {
    if (!elements) return;

    this.elements.section = elements.section || null;
    this.elements.currentVersion = elements.currentVersion || null;
    this.elements.statusIndicator = elements.statusIndicator || null;
    this.elements.statusText = elements.statusText || null;
    this.elements.progressContainer = elements.progressContainer || null;
    this.elements.progressFill = elements.progressFill || null;
    this.elements.progressText = elements.progressText || null;
    this.elements.actionBtn = elements.actionBtn || null;
    this.elements.badge = elements.badge || null;
  }

  private _bindEvents(): void {
    if (this.elements.actionBtn) {
      this.listen(this.elements.actionBtn, 'click', () => {
        void this._handleActionClick();
      });
    }
  }

  private _subscribeToEvents(): void {
    this.trackSubscription(
      this.eventBus.subscribe(
        EventChannels.UPDATE.STATE_CHANGED,
        (status) => this._updateUI(isUpdateStatus(status) ? status : null)
      )
    );

    this.trackSubscription(
      this.eventBus.subscribe(
        EventChannels.UPDATE.PROGRESS,
        (progress) => this._updateProgress(progress as UpdateProgress | null | undefined)
      )
    );

    this.trackSubscription(
      this.eventBus.subscribe(
        EventChannels.UPDATE.BADGE_SHOW,
        () => this._showBadge()
      )
    );

    this.trackSubscription(
      this.eventBus.subscribe(
        EventChannels.UPDATE.BADGE_HIDE,
        () => this._hideBadge()
      )
    );
  }

  private _loadInitialState(): void {
    const status = this.updateOrchestrator.getStatus();
    this._updateUI(status);

    if (status.state === UpdateState.AVAILABLE || status.state === UpdateState.DOWNLOADED) {
      this._showBadge();
    }
  }

  _updateUI(status: UpdateStatus | null | undefined): void {
    if (!status) return;

    const { state, updateInfo } = status;

    this._updateStatusIndicator(state);
    this._updateStatusText(state, updateInfo);
    this._updateActionButton(state);
    this._updateSectionStyle(state);
    this._updateProgressVisibility(state);
  }

  private _updateStatusIndicator(state: UpdateStateValue): void {
    const indicator = this.elements.statusIndicator;
    if (!indicator) return;

    indicator.classList.remove(
      CSSClasses.UPDATE_CHECKING,
      CSSClasses.UPDATE_DOWNLOADING,
      CSSClasses.UPDATE_DOWNLOADED,
      CSSClasses.UPDATE_ERROR,
      CSSClasses.AVAILABLE
    );

    switch (state) {
      case UpdateState.CHECKING:
        indicator.classList.add(CSSClasses.UPDATE_CHECKING);
        break;
      case UpdateState.AVAILABLE:
        indicator.classList.add(CSSClasses.AVAILABLE);
        break;
      case UpdateState.DOWNLOADING:
        indicator.classList.add(CSSClasses.UPDATE_DOWNLOADING);
        break;
      case UpdateState.DOWNLOADED:
        indicator.classList.add(CSSClasses.UPDATE_DOWNLOADED);
        break;
      case UpdateState.ERROR:
        indicator.classList.add(CSSClasses.UPDATE_ERROR);
        break;
    }
  }

  private _updateStatusText(state: UpdateStateValue, updateInfo?: UpdateInfo | null): void {
    const textEl = this.elements.statusText;
    if (!textEl) return;

    textEl.classList.remove(CSSClasses.HIGHLIGHT);

    switch (state) {
      case UpdateState.IDLE:
      case UpdateState.NOT_AVAILABLE:
        textEl.textContent = 'Up to date';
        textEl.classList.add(CSSClasses.FLASH_SUCCESS);
        this._scheduleTimeout(() => textEl.classList.remove(CSSClasses.FLASH_SUCCESS), 1500);
        break;
      case UpdateState.CHECKING:
        textEl.textContent = 'Checking for updates...';
        break;
      case UpdateState.AVAILABLE:
        textEl.textContent = `v${updateInfo?.version} available`;
        textEl.classList.add(CSSClasses.HIGHLIGHT);
        break;
      case UpdateState.DOWNLOADING:
        textEl.textContent = 'Downloading...';
        break;
      case UpdateState.DOWNLOADED:
        textEl.textContent = `v${updateInfo?.version} ready to install`;
        textEl.classList.add(CSSClasses.HIGHLIGHT);
        break;
      case UpdateState.ERROR:
        textEl.textContent = 'Update failed';
        break;
      default:
        textEl.textContent = 'Up to date';
    }
  }

  _scheduleTimeout(callback: () => void, delay: number): void {
    this.timeout(callback, delay);
  }

  private _updateActionButton(state: UpdateStateValue): void {
    const btn = this.elements.actionBtn;
    if (!btn) return;

    btn.disabled = false;
    btn.classList.remove(CSSClasses.BTN_INSTALL);

    switch (state) {
      case UpdateState.IDLE:
      case UpdateState.NOT_AVAILABLE:
      case UpdateState.ERROR:
        btn.textContent = 'Check for Updates';
        break;
      case UpdateState.CHECKING:
        btn.textContent = 'Checking...';
        btn.disabled = true;
        break;
      case UpdateState.AVAILABLE:
        btn.textContent = 'Download Update';
        break;
      case UpdateState.DOWNLOADING:
        btn.textContent = 'Downloading...';
        btn.disabled = true;
        break;
      case UpdateState.DOWNLOADED:
        btn.textContent = 'Install & Restart';
        btn.classList.add(CSSClasses.BTN_INSTALL);
        break;
    }
  }

  private _updateSectionStyle(state: UpdateStateValue): void {
    const section = this.elements.section;
    if (!section) return;

    if (state === UpdateState.AVAILABLE || state === UpdateState.DOWNLOADED) {
      section.classList.add(CSSClasses.UPDATE_AVAILABLE);
    } else {
      section.classList.remove(CSSClasses.UPDATE_AVAILABLE);
    }
  }

  private _updateProgressVisibility(state: UpdateStateValue): void {
    const container = this.elements.progressContainer;
    if (!container) return;

    if (state === UpdateState.DOWNLOADING) {
      container.classList.remove(CSSClasses.HIDDEN);
    } else {
      container.classList.add(CSSClasses.HIDDEN);
    }
  }

  _updateProgress(progress: UpdateProgress | null | undefined): void {
    if (!progress) return;

    const percent = progress.percent || 0;

    if (this.elements.progressFill) {
      this.elements.progressFill.style.width = `${percent}%`;
    }

    if (this.elements.progressText) {
      this.elements.progressText.textContent = `${Math.round(percent)}%`;
    }
  }

  _showBadge(): void {
    if (this.elements.badge) {
      this.elements.badge.classList.remove(CSSClasses.HIDDEN);
    }
  }

  _hideBadge(): void {
    if (this.elements.badge) {
      this.elements.badge.classList.add(CSSClasses.HIDDEN);
    }
  }

  async _handleActionClick(): Promise<void> {
    const btn = this.elements.actionBtn;
    if (!btn || btn.disabled) return;

    btn.disabled = true;

    try {
      const status = this.updateOrchestrator.getStatus();

      switch (status.state) {
        case UpdateState.IDLE:
        case UpdateState.NOT_AVAILABLE:
        case UpdateState.ERROR:
          await this.updateOrchestrator.checkForUpdates();
          break;
        case UpdateState.AVAILABLE:
          await this.updateOrchestrator.downloadUpdate();
          break;
        case UpdateState.DOWNLOADED:
          await this.updateOrchestrator.installUpdate();
          break;
      }
    } catch (error) {
      this.logger.error('Update action failed:', error);
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
        message: 'Update failed. Please try again.',
        type: 'error'
      });
    } finally {
      this._updateActionButton(this.updateOrchestrator.getStatus().state);
    }
  }

  setCurrentVersion(version: string): void {
    if (this.elements.currentVersion) {
      this.elements.currentVersion.textContent = version.startsWith('v') ? version : `v${version}`;
    }
  }

  protected override onDisposeError(error: unknown): void {
    this.logger.error('UpdateSectionComponent disposal failed', error);
  }

  override dispose(): void | Promise<void> {
    const disposed = super.dispose();
    this._initialized = false;
    this.elements = createEmptyUpdateSectionElements();
    this.logger.info('UpdateSectionComponent disposed');
    return disposed;
  }
}

export { UpdateSectionComponent };
