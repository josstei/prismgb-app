/**
 * ToolbarAutoHide - Manages toolbar auto-hiding during streaming
 *
 * Hides the streaming toolbar after inactivity.
 * Pauses hiding when hovering or when a panel is open.
 * Coordinates with cursor auto-hide through callbacks.
 */

import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { ActivityAutoHideController } from '@renderer/presentation/primitives/activity-auto-hide.controller';
import { PresentationComponent } from '@prismgb/ui-base';

type ToolbarAutoHideOptions = {
  onActivity?: () => void;
  onHide?: () => void;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
};

const TOOLBAR_PANEL_OBSERVER_LIFECYCLE = Symbol('toolbarPanelObserverLifecycle');

export class ToolbarAutoHide extends PresentationComponent {
  _element: HTMLElement | null;
  _hovering: boolean;
  _activityController: ActivityAutoHideController;
  _onActivity: () => void;
  _onHide: () => void;
  _onHoverStart: () => void;
  _onHoverEnd: () => void;
  _panelOpenCache: boolean;
  _panelCacheDirty: boolean;
  _panelObserver: MutationObserver | null;
  _boundHandleMouseEnter: () => void;
  _boundHandleMouseLeave: () => void;

  constructor(options: ToolbarAutoHideOptions = {}) {
    super();

    this._element = null;
    this._hovering = false;
    this._onActivity = options.onActivity || (() => {});
    this._onHide = options.onHide || (() => {});
    this._onHoverStart = options.onHoverStart || (() => {});
    this._onHoverEnd = options.onHoverEnd || (() => {});

    this._boundHandleMouseEnter = this._handleMouseEnter.bind(this);
    this._boundHandleMouseLeave = this._handleMouseLeave.bind(this);

    this._activityController = new ActivityAutoHideController({
      onActivity: () => {},
      onEnable: () => {},
      onDisable: () => {},
      shouldStartTimer: () => true
    });

    // Cached panel state to avoid repeated DOM queries
    this._panelOpenCache = false;
    this._panelCacheDirty = true;
    this._panelObserver = null;
    this.track(this._activityController);
  }

  get isEnabled() {
    return this._activityController.isEnabled;
  }

  get isHovering() {
    return this._hovering;
  }

  enable(element: HTMLElement | null) {
    if (this.isEnabled) return;

    this._element = element;
    if (!this._element) return;

    this._hovering = false;
    this._panelCacheDirty = true;

    this._activityController.enable({
      directEvents: [
        { target: this._element, type: 'mouseenter', handler: this._boundHandleMouseEnter },
        { target: this._element, type: 'mouseleave', handler: this._boundHandleMouseLeave }
      ]
    });

    this._bindPanelObserver();
    this._onActivity();
  }

  /**
   * Disable toolbar auto-hide
   */
  disable() {
    if (!this.isEnabled) return;

    this._activityController.disable();
    this.cancelManaged(TOOLBAR_PANEL_OBSERVER_LIFECYCLE);

    this.show();
    this._element = null;
    this._hovering = false;
    this._panelCacheDirty = true;
    this._panelOpenCache = false;
  }

  _handleMouseEnter() {
    this._hovering = true;
    this.show();
    this._onHoverStart();
  }

  _handleMouseLeave() {
    this._hovering = false;
    if (!this.isPanelOpen()) {
      this._onHoverEnd();
    }
  }

  /**
   * Hide the toolbar (if no panel is open)
   */
  hide() {
    if (this.isPanelOpen()) {
      return;
    }
    if (this._element) {
      this._element.classList.add(CSSClasses.TOOLBAR_HIDDEN);
      this._onHide();
    }
  }

  /**
   * Show the toolbar
   */
  show() {
    if (this._element) {
      this._element.classList.remove(CSSClasses.TOOLBAR_HIDDEN);
    }
  }

  isPanelOpen() {
    if (!this._element) return false;

    if (!this._panelObserver) {
      return this._readPanelOpenState();
    }

    if (!this._panelCacheDirty) {
      return this._panelOpenCache;
    }

    this._panelOpenCache = this._readPanelOpenState();
    this._panelCacheDirty = false;

    return this._panelOpenCache;
  }

  /**
   * Invalidate the panel open state cache
   * Call this when panel visibility changes
   */
  invalidatePanelCache() {
    this._panelCacheDirty = true;
  }

  _bindPanelObserver() {
    if (!this._element || typeof globalThis.MutationObserver === 'undefined') return;

    this.cancelManaged(TOOLBAR_PANEL_OBSERVER_LIFECYCLE);

    const observer = new globalThis.MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== 'attributes' || mutation.attributeName !== 'class') {
          continue;
        }

        const target = mutation.target instanceof Element ? mutation.target : null;
        if (!target) continue;

        const oldClassValue = mutation.oldValue || '';
        const panelOpenChanged =
          target.classList.contains(CSSClasses.PANEL_OPEN) ||
          oldClassValue.includes(CSSClasses.PANEL_OPEN);
        const shaderPanelChanged =
          (target.classList.contains('shader-panel') || oldClassValue.includes('shader-panel')) &&
          (target.classList.contains(CSSClasses.VISIBLE) || oldClassValue.includes(CSSClasses.VISIBLE));

        if (panelOpenChanged || shaderPanelChanged) {
          this._panelCacheDirty = true;
          break;
        }
      }
    });
    this._panelObserver = observer;
    this.replaceManaged(TOOLBAR_PANEL_OBSERVER_LIFECYCLE, () => {
      try {
        observer.disconnect();
      } catch {
        // MutationObserver may not be fully supported in test environments
      }
      if (this._panelObserver === observer) {
        this._panelObserver = null;
      }
    });

    try {
      observer.observe(this._element, {
        attributes: true,
        attributeFilter: ['class'],
        attributeOldValue: true,
        subtree: true
      });
    } catch {
      // MutationObserver may not be fully supported in test environments (Happy-DOM)
      // Fall back to always checking panel state on hide timer
      this.cancelManaged(TOOLBAR_PANEL_OBSERVER_LIFECYCLE);
      this._panelCacheDirty = true;
    }
  }

  _readPanelOpenState() {
    if (!this._element) return false;
    const shaderPanel = this._element.querySelector('.shader-panel.visible');
    const openButton = this._element.querySelector('.panel-open');
    return !!(shaderPanel || openButton);
  }

  /**
   * Dispose and cleanup resources
   */
  override dispose(): void | Promise<void> {
    this.disable();
    return super.dispose();
  }
}
