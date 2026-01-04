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
    this.minimalistFullscreenCheckbox = elements.settingMinimalistFullscreen;
    this.animationSaverCheckbox = elements.settingAnimationSaver;
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
    const minimalistFullscreenEnabled = this.settingsService.getMinimalistFullscreen?.() ?? false;
    const performanceModeEnabled = this.settingsService.getPerformanceMode?.() ?? false;

    if (this.statusStripCheckbox) {
      this.statusStripCheckbox.checked = statusStripVisible;
    }

    if (this.fullscreenOnStartupCheckbox) {
      this.fullscreenOnStartupCheckbox.checked = fullscreenOnStartupEnabled;
    }

    if (this.minimalistFullscreenCheckbox) {
      this.minimalistFullscreenCheckbox.checked = minimalistFullscreenEnabled;
    }

    if (this.animationSaverCheckbox) {
      this.animationSaverCheckbox.checked = performanceModeEnabled;
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

    // Collapse disclaimer when menu closes
    if (this.disclaimerExpanded) {
      this._collapseDisclaimer();
    }

    this.logger?.debug('Settings menu hidden');
  }

  /**
   * Setup click-outside-to-close behavior
   * @private
   */
  _setupClickOutside() {
    this._domListeners.add(document, 'click', (e) => {
      if (!this.isVisible) return;

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
