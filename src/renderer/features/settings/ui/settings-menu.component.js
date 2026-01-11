/**
 * Settings Menu Component
 *
 * Dropdown menu for application settings.
 * Implements standard popup behavior (click-outside-to-close, escape key).
 */

import { createDomListenerManager } from '@shared/base/dom-listener.utils.js';
import { DOMSelectors } from '@shared/config/dom-selectors.config.js';
import { CSSClasses } from '@shared/config/css-classes.config.js';

class SettingsMenuComponent {
  constructor({ settingsService, updateSectionComponent, eventBus, loggerFactory, logger }) {
    this.settingsService = settingsService;
    this.eventBus = eventBus;
    this.loggerFactory = loggerFactory;
    this.logger = logger;
    this.isVisible = false;
    this.disclaimerExpanded = false;

    // Track DOM listeners for cleanup
    this._domListeners = createDomListenerManager({ logger });

    // Update section component (composed externally)
    this._updateSection = updateSectionComponent || null;
  }

  /**
   * Initialize component with DOM elements
   * @param {Object} elements - DOM element references
   */
  initialize(elements) {
    this.container = elements.settingsMenuContainer;
    this.toggleButton = elements.settingsBtn;
    this.statusStripCheckbox = elements.settingStatusStrip;
    this.fullscreenOnStartupCheckbox = elements.settingFullscreenOnStartup;
    this.autoStreamOnConnectCheckbox = elements.settingAutoStreamOnConnect;
    this.minimalistFullscreenCheckbox = elements.settingMinimalistFullscreen;
    this.animationSaverCheckbox = elements.settingAnimationSaver;
    this.recordingFormatTrigger = elements.settingRecordingFormat;
    this.recordingFormatMenu = elements.recordingFormatMenu;
    this.isRecordingFormatOpen = false;
    this.disclaimerBtn = elements.disclaimerBtn;
    this.disclaimerContent = elements.disclaimerContent;
    this.footer = elements.footer;

    if (!this.container || !this.toggleButton) {
      this.logger?.warn('Settings menu elements not found');
      return;
    }

    this._bindEvents();
    this._loadCurrentSettings();
    this._setupClickOutside();
    this._setupEscapeKey();
    this._setAppVersion();
    this._initializeUpdateSection();

    this.logger?.debug('SettingsMenuComponent initialized');
  }

  _initializeUpdateSection() {
    if (!this._updateSection) {
      this.logger?.debug('UpdateSectionComponent not provided - update section disabled');
      return;
    }

    this._updateSection.initialize();

    // Set current version
    if (typeof __APP_VERSION__ !== 'undefined') {
      this._updateSection.setCurrentVersion(__APP_VERSION__);
    }
  }

  _setAppVersion() {
    const versionElement = document.getElementById(DOMSelectors.APP_VERSION);
    if (versionElement && typeof __APP_VERSION__ !== 'undefined') {
      versionElement.textContent = `v${__APP_VERSION__}`;
    }
  }

  /**
   * Bind internal event handlers
   * @private
   */
  _bindEvents() {
    // Status strip toggle
    if (this.statusStripCheckbox) {
      this._domListeners.add(this.statusStripCheckbox, 'change', () => {
        const visible = this.statusStripCheckbox.checked;
        this.settingsService.setStatusStripVisible(visible);
        this._applyStatusStripVisibility(visible);
      });
    }

    // Fullscreen on startup toggle
    if (this.fullscreenOnStartupCheckbox) {
      this._domListeners.add(this.fullscreenOnStartupCheckbox, 'change', () => {
        const enabled = this.fullscreenOnStartupCheckbox.checked;
        this.settingsService.setFullscreenOnStartup(enabled);
      });
    }

    // Auto-stream on connect toggle
    if (this.autoStreamOnConnectCheckbox) {
      this._domListeners.add(this.autoStreamOnConnectCheckbox, 'change', () => {
        this.settingsService.setAutoStreamOnConnect(this.autoStreamOnConnectCheckbox.checked);
      });
    }

    // Minimalist fullscreen toggle
    if (this.minimalistFullscreenCheckbox) {
      this._domListeners.add(this.minimalistFullscreenCheckbox, 'change', () => {
        const enabled = this.minimalistFullscreenCheckbox.checked;
        this.settingsService.setMinimalistFullscreen(enabled);
      });
    }

    // Animation power saver toggle
    if (this.animationSaverCheckbox) {
      this._domListeners.add(this.animationSaverCheckbox, 'change', () => {
        const enabled = this.animationSaverCheckbox.checked;
        this.settingsService.setPerformanceMode(enabled);
      });
    }

    // Recording format dropdown
    if (this.recordingFormatTrigger && this.recordingFormatMenu) {
      this._domListeners.add(this.recordingFormatTrigger, 'click', (e) => {
        e.stopPropagation();
        this._toggleRecordingFormatMenu();
      });

      this._domListeners.add(this.recordingFormatMenu, 'click', (e) => {
        const option = e.target.closest('.settings-select-option');
        if (!option) return;
        this._selectRecordingFormat(option.dataset.value, option.textContent);
      });
    }

    // Disclaimer expand/collapse
    if (this.disclaimerBtn && this.disclaimerContent) {
      this._domListeners.add(this.disclaimerBtn, 'click', () => {
        this._toggleDisclaimer();
      });
    }

    // External links
    this._setupExternalLinks();
  }

  /**
   * Load current settings and apply to UI
   * @private
   */
  _loadCurrentSettings() {
    const statusStripVisible = this.settingsService.getStatusStripVisible();
    const fullscreenOnStartupEnabled = this.settingsService.getFullscreenOnStartup?.() ?? false;
    const autoStreamOnConnectEnabled = this.settingsService.getAutoStreamOnConnect?.() ?? false;
    const minimalistFullscreenEnabled = this.settingsService.getMinimalistFullscreen?.() ?? false;
    const performanceModeEnabled = this.settingsService.getPerformanceMode?.() ?? false;
    const recordingFormat = this.settingsService.getRecordingFormat?.() ?? 'webm';

    if (this.statusStripCheckbox) {
      this.statusStripCheckbox.checked = statusStripVisible;
    }

    if (this.fullscreenOnStartupCheckbox) {
      this.fullscreenOnStartupCheckbox.checked = fullscreenOnStartupEnabled;
    }

    if (this.autoStreamOnConnectCheckbox) {
      this.autoStreamOnConnectCheckbox.checked = autoStreamOnConnectEnabled;
    }

    if (this.minimalistFullscreenCheckbox) {
      this.minimalistFullscreenCheckbox.checked = minimalistFullscreenEnabled;
    }

    if (this.animationSaverCheckbox) {
      this.animationSaverCheckbox.checked = performanceModeEnabled;
    }

    if (this.recordingFormatTrigger && this.recordingFormatMenu) {
      // Update label and active state
      const label = this.recordingFormatTrigger.querySelector('.settings-select-label');
      const options = this.recordingFormatMenu.querySelectorAll('.settings-select-option');
      options.forEach(option => {
        const isActive = option.dataset.value === recordingFormat;
        option.classList.toggle('active', isActive);
        option.setAttribute('aria-selected', isActive ? 'true' : 'false');
        if (isActive && label) {
          label.textContent = option.textContent;
        }
      });
    }

    this._applyStatusStripVisibility(statusStripVisible);
  }

  /**
   * Apply status strip visibility to footer
   * @param {boolean} visible
   * @private
   */
  _applyStatusStripVisibility(visible) {
    if (!this.footer) return;

    if (visible) {
      this.footer.classList.remove(CSSClasses.STATUS_HIDDEN);
    } else {
      this.footer.classList.add(CSSClasses.STATUS_HIDDEN);
    }
  }

  /**
   * Toggle settings menu visibility
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Show settings menu
   */
  show() {
    if (!this.container) return;

    this.container.classList.add(CSSClasses.VISIBLE);
    this.toggleButton?.setAttribute('aria-expanded', 'true');
    this.isVisible = true;

    this.logger?.debug('Settings menu shown');
  }

  /**
   * Hide settings menu
   */
  hide() {
    if (!this.container) return;

    this.container.classList.remove(CSSClasses.VISIBLE);
    this.toggleButton?.setAttribute('aria-expanded', 'false');
    this.isVisible = false;

    // Close dropdowns when menu closes
    this._hideRecordingFormatMenu();

    // Collapse disclaimer when menu closes
    if (this.disclaimerExpanded) {
      this._collapseDisclaimer();
    }

    this.logger?.debug('Settings menu hidden');
  }

  /**
   * Toggle recording format dropdown
   * @private
   */
  _toggleRecordingFormatMenu() {
    if (this.isRecordingFormatOpen) {
      this._hideRecordingFormatMenu();
    } else {
      this._showRecordingFormatMenu();
    }
  }

  /**
   * Show recording format dropdown
   * @private
   */
  _showRecordingFormatMenu() {
    if (!this.recordingFormatMenu) return;
    this.recordingFormatMenu.classList.add(CSSClasses.VISIBLE);
    this.recordingFormatTrigger?.setAttribute('aria-expanded', 'true');
    this.isRecordingFormatOpen = true;
  }

  /**
   * Hide recording format dropdown
   * @private
   */
  _hideRecordingFormatMenu() {
    if (!this.recordingFormatMenu) return;
    this.recordingFormatMenu.classList.remove(CSSClasses.VISIBLE);
    this.recordingFormatTrigger?.setAttribute('aria-expanded', 'false');
    this.isRecordingFormatOpen = false;
  }

  /**
   * Select a recording format option
   * @param {string} value - Format value
   * @param {string} label - Display label
   * @private
   */
  _selectRecordingFormat(value, label) {
    // Update label
    const labelEl = this.recordingFormatTrigger?.querySelector('.settings-select-label');
    if (labelEl) {
      labelEl.textContent = label;
    }

    // Update active state
    const options = this.recordingFormatMenu?.querySelectorAll('.settings-select-option');
    options?.forEach(option => {
      const isActive = option.dataset.value === value;
      option.classList.toggle('active', isActive);
      option.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // Save setting
    this.settingsService.setRecordingFormat(value);

    // Close dropdown
    this._hideRecordingFormatMenu();
  }

  /**
   * Setup click-outside-to-close behavior
   * @private
   */
  _setupClickOutside() {
    this._domListeners.add(document, 'click', (e) => {
      if (!this.isVisible) return;

      // Close recording format dropdown when clicking outside it
      if (this.isRecordingFormatOpen && !e.target.closest('.settings-select-wrapper')) {
        this._hideRecordingFormatMenu();
      }

      // Don't close if clicking inside the menu or on the toggle button
      if (e.target.closest('.settings-menu-container') || e.target.closest('#settingsBtn')) {
        return;
      }

      this.hide();
    });
  }

  /**
   * Setup escape key to close menu
   * @private
   */
  _setupEscapeKey() {
    this._domListeners.add(document, 'keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });
  }

  /**
   * Setup external link handlers
   * @private
   */
  _setupExternalLinks() {
    const linkGithub = document.getElementById(DOMSelectors.LINK_GITHUB);
    const linkWebsite = document.getElementById(DOMSelectors.LINK_WEBSITE);
    const linkX = document.getElementById(DOMSelectors.LINK_X);
    const linkKofi = document.getElementById(DOMSelectors.LINK_KOFI);
    const linkModRetro = document.getElementById(DOMSelectors.LINK_MOD_RETRO);

    const handleExternalLink = (e, url) => {
      e.preventDefault();
      // Use Electron's shell.openExternal if available via preload
      if (window.shellAPI?.openExternal) {
        window.shellAPI.openExternal(url);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    };

    if (linkGithub) {
      this._domListeners.add(linkGithub, 'click', (e) => {
        handleExternalLink(e, 'https://github.com/josstei/prismgb-app');
      });
    }

    if (linkWebsite) {
      this._domListeners.add(linkWebsite, 'click', (e) => {
        handleExternalLink(e, 'https://prismgb.com');
      });
    }

    if (linkX) {
      this._domListeners.add(linkX, 'click', (e) => {
        handleExternalLink(e, 'https://x.com/prism_gb');
      });
    }

    if (linkKofi) {
      this._domListeners.add(linkKofi, 'click', (e) => {
        handleExternalLink(e, 'https://ko-fi.com/josstei');
      });
    }

    if (linkModRetro) {
      this._domListeners.add(linkModRetro, 'click', (e) => {
        handleExternalLink(e, 'https://modretro.com');
      });
    }
  }

  /**
   * Toggle disclaimer expanded state
   * @private
   */
  _toggleDisclaimer() {
    if (this.disclaimerExpanded) {
      this._collapseDisclaimer();
    } else {
      this._expandDisclaimer();
    }
  }

  /**
   * Expand disclaimer content
   * @private
   */
  _expandDisclaimer() {
    if (!this.disclaimerContent || !this.disclaimerBtn) return;

    this.disclaimerContent.classList.add(CSSClasses.VISIBLE);
    this.disclaimerBtn.setAttribute('aria-expanded', 'true');
    this.disclaimerExpanded = true;
  }

  /**
   * Collapse disclaimer content
   * @private
   */
  _collapseDisclaimer() {
    if (!this.disclaimerContent || !this.disclaimerBtn) return;

    this.disclaimerContent.classList.remove(CSSClasses.VISIBLE);
    this.disclaimerBtn.setAttribute('aria-expanded', 'false');
    this.disclaimerExpanded = false;
  }

  /**
   * Dispose and cleanup event listeners
   */
  dispose() {
    this._domListeners.removeAll();
    this._updateSection?.dispose();
    this._updateSection = null;
  }
}

export { SettingsMenuComponent };
