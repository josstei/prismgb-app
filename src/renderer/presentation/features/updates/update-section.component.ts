import type { LoggerFactoryLike } from '@platform/core';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { EventChannels } from '@platform/events';
import { UpdateState } from '@platform/config';
import type { UpdateStateValue } from '@platform/config';
import {
  PresentationComponent,
  bindText,
  bindClass,
  bindProperty,
  bindStyleProperty,
  computed,
  effect
} from '@platform/ui-base';
import { signal } from '@platform/ui-base/reactive';

type Unsubscribe = () => void;

type LoggerLike = {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
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

const INDICATOR_CLASS_BY_STATE: Partial<Record<UpdateStateValue, string>> = {
  [UpdateState.CHECKING]: CSSClasses.UPDATE_CHECKING,
  [UpdateState.AVAILABLE]: CSSClasses.AVAILABLE,
  [UpdateState.DOWNLOADING]: CSSClasses.UPDATE_DOWNLOADING,
  [UpdateState.DOWNLOADED]: CSSClasses.UPDATE_DOWNLOADED,
  [UpdateState.ERROR]: CSSClasses.UPDATE_ERROR
};

const ALL_INDICATOR_CLASSES = [
  CSSClasses.UPDATE_CHECKING,
  CSSClasses.AVAILABLE,
  CSSClasses.UPDATE_DOWNLOADING,
  CSSClasses.UPDATE_DOWNLOADED,
  CSSClasses.UPDATE_ERROR
];

function statusTextFor(state: UpdateStateValue, version: string): string {
  switch (state) {
    case UpdateState.CHECKING:
      return 'Checking for updates...';
    case UpdateState.AVAILABLE:
      return `v${version} available`;
    case UpdateState.DOWNLOADING:
      return 'Downloading...';
    case UpdateState.DOWNLOADED:
      return `v${version} ready to install`;
    case UpdateState.ERROR:
      return 'Update failed';
    default:
      return 'Up to date';
  }
}

function actionLabelFor(state: UpdateStateValue): string {
  switch (state) {
    case UpdateState.CHECKING:
      return 'Checking...';
    case UpdateState.AVAILABLE:
      return 'Download Update';
    case UpdateState.DOWNLOADING:
      return 'Downloading...';
    case UpdateState.DOWNLOADED:
      return 'Install & Restart';
    default:
      return 'Check for Updates';
  }
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

/**
 * Renders the update section declaratively: the indicator/status/action/progress/badge UI is
 * bound to the update-state, version, progress, and badge signals, fed by the UPDATE.* channels.
 * Only the action-button click flow remains imperative.
 */
class UpdateSectionComponent extends PresentationComponent {
  private readonly updateOrchestrator: UpdateOrchestratorLike;
  private readonly eventBus: EventBusLike;
  private readonly logger: LoggerLike;
  private _initialized: boolean;
  elements: CachedUpdateSectionElements;

  private readonly _state = signal<UpdateStateValue>(UpdateState.IDLE);
  private readonly _version = signal('');
  private readonly _progressPercent = signal(0);
  private readonly _badgeVisible = signal(false);
  private readonly _actionInProgress = signal(false);

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
    this._bindUI();
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

  private _bindUI(): void {
    const elements = this.elements;
    const isUpdateReady = computed(
      () => this._state.value === UpdateState.AVAILABLE || this._state.value === UpdateState.DOWNLOADED
    );

    this.track(effect(() => {
      const indicator = elements.statusIndicator;
      if (!indicator) return;
      ALL_INDICATOR_CLASSES.forEach((className) => indicator.classList.remove(className));
      const className = INDICATOR_CLASS_BY_STATE[this._state.value];
      if (className) indicator.classList.add(className);
    }));

    this.track(bindText(elements.statusText, computed(() => statusTextFor(this._state.value, this._version.value))));
    this.track(bindClass(elements.statusText, CSSClasses.HIGHLIGHT, isUpdateReady));
    this.track(effect(() => {
      const state = this._state.value;
      const element = elements.statusText;
      if (element && (state === UpdateState.IDLE || state === UpdateState.NOT_AVAILABLE)) {
        element.classList.add(CSSClasses.FLASH_SUCCESS);
        this.timeout(() => element.classList.remove(CSSClasses.FLASH_SUCCESS), 1500);
      }
    }));

    this.track(bindText(elements.actionBtn, computed(() => actionLabelFor(this._state.value))));
    this.track(bindProperty(
      elements.actionBtn,
      'disabled',
      computed(() =>
        this._actionInProgress.value ||
        this._state.value === UpdateState.CHECKING ||
        this._state.value === UpdateState.DOWNLOADING
      )
    ));
    this.track(bindClass(
      elements.actionBtn,
      CSSClasses.BTN_INSTALL,
      computed(() => this._state.value === UpdateState.DOWNLOADED)
    ));

    this.track(bindClass(elements.section, CSSClasses.UPDATE_AVAILABLE, isUpdateReady));

    this.track(bindClass(
      elements.progressContainer,
      CSSClasses.HIDDEN,
      computed(() => this._state.value !== UpdateState.DOWNLOADING)
    ));
    this.track(bindStyleProperty(elements.progressFill, 'width', computed(() => `${this._progressPercent.value}%`)));
    this.track(bindText(elements.progressText, computed(() => `${Math.round(this._progressPercent.value)}%`)));

    this.track(bindClass(elements.badge, CSSClasses.HIDDEN, computed(() => !this._badgeVisible.value)));
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
        (status) => this._applyStatus(status)
      )
    );

    this.trackSubscription(
      this.eventBus.subscribe(
        EventChannels.UPDATE.PROGRESS,
        (progress) => {
          const payload = progress as UpdateProgress | null | undefined;
          if (payload) this._progressPercent.value = payload.percent || 0;
        }
      )
    );

    this.trackSubscription(
      this.eventBus.subscribe(EventChannels.UPDATE.BADGE_SHOW, () => {
        this._badgeVisible.value = true;
      })
    );

    this.trackSubscription(
      this.eventBus.subscribe(EventChannels.UPDATE.BADGE_HIDE, () => {
        this._badgeVisible.value = false;
      })
    );
  }

  private _applyStatus(status: unknown): void {
    if (!isUpdateStatus(status)) return;
    this._state.value = status.state;
    this._version.value = status.updateInfo?.version ?? '';
  }

  private _loadInitialState(): void {
    const status = this.updateOrchestrator.getStatus();
    this._applyStatus(status);

    if (status.state === UpdateState.AVAILABLE || status.state === UpdateState.DOWNLOADED) {
      this._badgeVisible.value = true;
    }
  }

  async _handleActionClick(): Promise<void> {
    const btn = this.elements.actionBtn;
    if (!btn || btn.disabled) return;

    this._actionInProgress.value = true;

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
      this._actionInProgress.value = false;
      this._applyStatus(this.updateOrchestrator.getStatus());
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
