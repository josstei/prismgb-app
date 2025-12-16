/**
 * Update Section Component
 *
 * UI component for the updates section in the settings menu.
 * Displays current version, update status, progress, and action button.
 * Manages badge visibility and rainbow border animation.
 */

import { DOMSelectors } from '@shared/config/dom-selectors.js';
import { CSSClasses } from '@shared/config/css-classes.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';
import { UpdateState } from '../services/update.service.js';

class UpdateSectionComponent {
  constructor({ updateOrchestrator, eventBus, loggerFactory }) {
    this.updateOrchestrator = updateOrchestrator;
    this.eventBus = eventBus;
    this.logger = loggerFactory?.create('UpdateSectionComponent') || console;

    this._subscriptions = [];
    this._initialized = false;

    this.elements = {
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

  initialize() {
    if (this._initialized) {
      this.logger.warn('UpdateSectionComponent already initialized');
      return;
    }

    this._cacheElements();
    this._bindEvents();
    this._subscribeToEvents();
    this._loadInitialState();

    this._initialized = true;
    this.logger.info('UpdateSectionComponent initialized');
  }

  _cacheElements() {
    this.elements.section = document.getElementById(DOMSelectors.UPDATE_SECTION);
    this.elements.currentVersion = document.getElementById(DOMSelectors.UPDATE_CURRENT_VERSION);
    this.elements.statusIndicator = document.getElementById(DOMSelectors.UPDATE_STATUS_INDICATOR);
    this.elements.statusText = document.getElementById(DOMSelectors.UPDATE_STATUS_TEXT);
    this.elements.progressContainer = document.getElementById(DOMSelectors.UPDATE_PROGRESS_CONTAINER);
    this.elements.progressFill = document.getElementById(DOMSelectors.UPDATE_PROGRESS_FILL);
    this.elements.progressText = document.getElementById(DOMSelectors.UPDATE_PROGRESS_TEXT);
    this.elements.actionBtn = document.getElementById(DOMSelectors.UPDATE_ACTION_BTN);
    this.elements.badge = document.getElementById(DOMSelectors.UPDATE_BADGE);
  }

  _bindEvents() {
    if (this.elements.actionBtn) {
      this.elements.actionBtn.addEventListener('click', () => this._handleActionClick());
    }
  }

  _subscribeToEvents() {
    const unsubStateChanged = this.eventBus.subscribe(
      EventChannels.UPDATE.STATE_CHANGED,
      (status) => this._updateUI(status)
    );
    this._subscriptions.push(unsubStateChanged);

    const unsubProgress = this.eventBus.subscribe(
      EventChannels.UPDATE.PROGRESS,
      (progress) => this._updateProgress(progress)
    );
    this._subscriptions.push(unsubProgress);

    const unsubBadgeShow = this.eventBus.subscribe(
      EventChannels.UPDATE.BADGE_SHOW,
      () => this._showBadge()
    );
    this._subscriptions.push(unsubBadgeShow);

    const unsubBadgeHide = this.eventBus.subscribe(
      EventChannels.UPDATE.BADGE_HIDE,
      () => this._hideBadge()
    );
    this._subscriptions.push(unsubBadgeHide);
  }

  _loadInitialState() {
    const status = this.updateOrchestrator.getStatus();
    this._updateUI(status);

    if (status.state === UpdateState.AVAILABLE || status.state === UpdateState.DOWNLOADED) {
      this._showBadge();
    }
  }

  _updateUI(status) {
    if (!status) return;

    const { state, updateInfo } = status;

    this._updateStatusIndicator(state);
    this._updateStatusText(state, updateInfo);
    this._updateActionButton(state);
    this._updateSectionStyle(state);
    this._updateProgressVisibility(state);
  }

  _updateStatusIndicator(state) {
    const indicator = this.elements.statusIndicator;
    if (!indicator) return;

    indicator.classList.remove(
      CSSClasses.UPDATE_CHECKING,
      CSSClasses.UPDATE_DOWNLOADING,
      CSSClasses.UPDATE_DOWNLOADED,
      CSSClasses.UPDATE_ERROR,
      'available'
    );

    switch (state) {
      case UpdateState.CHECKING:
        indicator.classList.add(CSSClasses.UPDATE_CHECKING);
        break;
      case UpdateState.AVAILABLE:
        indicator.classList.add('available');
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

  _updateStatusText(state, updateInfo) {
    const textEl = this.elements.statusText;
    if (!textEl) return;

    textEl.classList.remove('highlight');

    switch (state) {
      case UpdateState.IDLE:
      case UpdateState.NOT_AVAILABLE:
        textEl.textContent = 'Up to date';
        textEl.classList.add('flash-success');
        setTimeout(() => textEl.classList.remove('flash-success'), 1500);
        break;
      case UpdateState.CHECKING:
        textEl.textContent = 'Checking for updates...';
        break;
      case UpdateState.AVAILABLE:
        textEl.textContent = `v${updateInfo?.version} available`;
        textEl.classList.add('highlight');
        break;
      case UpdateState.DOWNLOADING:
        textEl.textContent = 'Downloading...';
        break;
      case UpdateState.DOWNLOADED:
        textEl.textContent = `v${updateInfo?.version} ready to install`;
        textEl.classList.add('highlight');
        break;
      case UpdateState.ERROR:
        textEl.textContent = 'Update failed';
        break;
      default:
        textEl.textContent = 'Up to date';
    }
  }

  _updateActionButton(state) {
    const btn = this.elements.actionBtn;
    if (!btn) return;

    btn.disabled = false;
    btn.classList.remove('btn-install');

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
        btn.classList.add('btn-install');
        break;
    }
  }

  _updateSectionStyle(state) {
    const section = this.elements.section;
    if (!section) return;

    if (state === UpdateState.AVAILABLE || state === UpdateState.DOWNLOADED) {
      section.classList.add(CSSClasses.UPDATE_AVAILABLE);
    } else {
      section.classList.remove(CSSClasses.UPDATE_AVAILABLE);
    }
  }

  _updateProgressVisibility(state) {
    const container = this.elements.progressContainer;
    if (!container) return;

    if (state === UpdateState.DOWNLOADING) {
      container.classList.remove(CSSClasses.HIDDEN);
    } else {
      container.classList.add(CSSClasses.HIDDEN);
    }
  }

  _updateProgress(progress) {
    if (!progress) return;

    const percent = progress.percent || 0;

    if (this.elements.progressFill) {
      this.elements.progressFill.style.width = `${percent}%`;
    }

    if (this.elements.progressText) {
      this.elements.progressText.textContent = `${Math.round(percent)}%`;
    }
  }

  _showBadge() {
    if (this.elements.badge) {
      this.elements.badge.classList.remove(CSSClasses.HIDDEN);
    }
  }

  _hideBadge() {
    if (this.elements.badge) {
      this.elements.badge.classList.add(CSSClasses.HIDDEN);
    }
  }

  async _handleActionClick() {
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
  }

  setCurrentVersion(version) {
    if (this.elements.currentVersion) {
      this.elements.currentVersion.textContent = version.startsWith('v') ? version : `v${version}`;
    }
  }

  dispose() {
    this._subscriptions.forEach(unsubscribe => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    this._subscriptions = [];

    if (this.elements.actionBtn) {
      this.elements.actionBtn.replaceWith(this.elements.actionBtn.cloneNode(true));
    }

    this._initialized = false;
    this.logger.info('UpdateSectionComponent disposed');
  }
}

export { UpdateSectionComponent };
