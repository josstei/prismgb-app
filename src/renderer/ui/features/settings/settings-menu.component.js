/**
 * Settings Menu Component
 *
 * Dropdown menu for application settings.
 * Implements standard popup behavior (click-outside-to-close, escape key).
 */

import { createDomListenerManager } from '@shared/base/dom-listener.utils.js';
import { CSSClasses } from '@shared/config/css-classes.config.js';
import { DisclosureController } from '@renderer/ui/primitives/disclosure.class.js';
import { ListboxDropdownController } from '@renderer/ui/primitives/listbox-dropdown.class.js';

class SettingsMenuComponent {
  constructor({ settingsService, updateSectionComponent, eventBus, loggerFactory, logger }) {
    this.settingsService = settingsService;
    this.eventBus = eventBus;
    this.loggerFactory = loggerFactory;
    this.logger = logger;
    this.isVisible = false;
    this.disclaimerExpanded = false;
    this._menuDisclosure = null;
    this.recordingFormatDropdown = null;

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
    this.recordingFormatLabel = elements.recordingFormatLabel;
    this.recordingFormatMenu = elements.recordingFormatMenu;
    this.disclaimerBtn = elements.disclaimerBtn;
    this.disclaimerContent = elements.disclaimerContent;
    this.footer = elements.footer;
    this.appVersion = elements.appVersion;
    this.linkGithub = elements.linkGithub;
    this.linkWebsite = elements.linkWebsite;
    this.linkX = elements.linkX;
    this.linkKofi = elements.linkKofi;
    this.linkModRetro = elements.linkModRetro;
    this.updateElements = {
      section: elements.updateSection,
      currentVersion: elements.updateCurrentVersion,
      statusIndicator: elements.updateStatusIndicator,
      statusText: elements.updateStatusText,
      progressContainer: elements.updateProgressContainer,
      progressFill: elements.updateProgressFill,
      progressText: elements.updateProgressText,
      actionBtn: elements.updateActionBtn,
      badge: elements.updateBadge
    };

    if (!this.container || !this.toggleButton) {
      this.logger?.warn('Settings menu elements not found');
      return;
    }

    this._bindEvents();
    this._setupMenuDisclosure();
    this._setupRecordingFormatDropdown();
    this._loadCurrentSettings();
    this._setAppVersion();
    this._initializeUpdateSection();

    this.logger?.debug('SettingsMenuComponent initialized');
  }

  _initializeUpdateSection() {
    if (!this._updateSection) {
      this.logger?.debug('UpdateSectionComponent not provided - update section disabled');
      return;
    }

    this._updateSection.initialize(this.updateElements);

    // Set current version
    if (typeof __APP_VERSION__ !== 'undefined') {
      this._updateSection.setCurrentVersion(__APP_VERSION__);
    }
  }

  _setAppVersion() {
    if (this.appVersion && typeof __APP_VERSION__ !== 'undefined') {
      this.appVersion.textContent = `v${__APP_VERSION__}`;
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

    if (this.recordingFormatDropdown) {
      this.recordingFormatDropdown.setActive(recordingFormat);
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
    this._menuDisclosure?.toggle();
  }

  /**
   * Show settings menu
   */
  show() {
    this._menuDisclosure?.show();
  }

  /**
   * Hide settings menu
   */
  hide() {
    this._menuDisclosure?.hide();
  }

  _setupRecordingFormatDropdown() {
    if (!this.recordingFormatTrigger || !this.recordingFormatMenu) return;

    this.recordingFormatDropdown = new ListboxDropdownController({
      triggerElement: this.recordingFormatTrigger,
      menuElement: this.recordingFormatMenu,
      labelElement: this.recordingFormatLabel,
      optionSelector: '.settings-select-option',
      ignoreOutsideSelectors: ['.settings-select-wrapper'],
      onChange: (value) => {
        this.settingsService.setRecordingFormat(value);
      },
      logger: this.logger
    });

    this.recordingFormatDropdown.initialize();
  }

  /**
   * Setup disclosure controller for menu open/close
   * @private
   */
  _setupMenuDisclosure() {
    if (!this.container || !this.toggleButton) return;

    this._menuDisclosure = new DisclosureController({
      toggleElement: this.toggleButton,
      panelElement: this.container,
      visibleClass: CSSClasses.VISIBLE,
      logger: this.logger,
      onShow: () => {
        this.isVisible = true;
        this.logger?.debug('Settings menu shown');
      },
      onHide: () => {
        this.isVisible = false;

        // Close dropdowns when menu closes
        this.recordingFormatDropdown?.hide();

        // Collapse disclaimer when menu closes
        if (this.disclaimerExpanded) {
          this._collapseDisclaimer();
        }

        this.logger?.debug('Settings menu hidden');
      }
    });

    this._menuDisclosure.initialize();
  }

  /**
   * Setup external link handlers
   * @private
   */
  _setupExternalLinks() {
    const handleExternalLink = (e, url) => {
      e.preventDefault();
      // Use Electron's shell.openExternal if available via preload
      if (window.shellAPI?.openExternal) {
        window.shellAPI.openExternal(url);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    };

    if (this.linkGithub) {
      this._domListeners.add(this.linkGithub, 'click', (e) => {
        handleExternalLink(e, 'https://github.com/josstei/prismgb-app');
      });
    }

    if (this.linkWebsite) {
      this._domListeners.add(this.linkWebsite, 'click', (e) => {
        handleExternalLink(e, 'https://prismgb.com');
      });
    }

    if (this.linkX) {
      this._domListeners.add(this.linkX, 'click', (e) => {
        handleExternalLink(e, 'https://x.com/prism_gb');
      });
    }

    if (this.linkKofi) {
      this._domListeners.add(this.linkKofi, 'click', (e) => {
        handleExternalLink(e, 'https://ko-fi.com/josstei');
      });
    }

    if (this.linkModRetro) {
      this._domListeners.add(this.linkModRetro, 'click', (e) => {
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
    this._menuDisclosure?.dispose();
    this._menuDisclosure = null;
    this.recordingFormatDropdown?.dispose();
    this.recordingFormatDropdown = null;
    this._updateSection?.dispose();
    this._updateSection = null;
  }
}

export { SettingsMenuComponent };
