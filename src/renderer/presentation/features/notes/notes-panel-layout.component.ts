import {
  PresentationComponent,
  calculateAnchoredDisclosureLayout,
  type AnchoredLayoutSizeDefaults
} from '@platform/ui-base';
import type { LoggerLike } from '@platform/core';

const RESIZE_DEBOUNCE_MS = 100;
const RESIZE_DEBOUNCE_TIMEOUT = Symbol('notesPanelLayoutResizeDebounceTimeout');
const LAYOUT_SETUP_LIFECYCLE = Symbol('notesPanelLayoutSetupLifecycle');

export interface NotesPanelLayoutComponentOptions {
  logger?: LoggerLike | null;
}

export interface NotesPanelLayoutInitializeOptions {
  panelElement?: HTMLElement | null;
  toolbarElement?: HTMLElement | null;
  streamContainer?: HTMLElement | null;
}

class NotesPanelLayoutComponent extends PresentationComponent {
  declare logger: LoggerLike | null | undefined;
  declare _resizeObserver: ResizeObserver | null;
  declare _panelSizeDefaults: AnchoredLayoutSizeDefaults | null;
  declare panelElement: HTMLElement | null | undefined;
  declare toolbarElement: HTMLElement | null | undefined;
  declare streamContainer: HTMLElement | null | undefined;

  constructor(options: NotesPanelLayoutComponentOptions) {
    super();
    this.applyOptions<NotesPanelLayoutComponentOptions>({}, options);
    this._resizeObserver = null;
    this._panelSizeDefaults = null;
    this.panelElement = null;
    this.toolbarElement = null;
    this.streamContainer = null;
  }

  initialize(options: NotesPanelLayoutInitializeOptions): void {
    this.cancelManaged(LAYOUT_SETUP_LIFECYCLE);
    this.cancelManaged(RESIZE_DEBOUNCE_TIMEOUT);
    this._resizeObserver = null;
    this.applyOptions<NotesPanelLayoutInitializeOptions>({}, options);

    if (!this.panelElement || !this.toolbarElement) return;

    this._panelSizeDefaults = this._getPanelSizeDefaults();
    this._setupResizeHandler();
    this.updatePosition();
  }

  updatePosition(): void {
    if (!this.panelElement || !this.toolbarElement) return;

    const toolbarRect = this.toolbarElement.getBoundingClientRect();
    const panelStyles = window.getComputedStyle(this.panelElement);
    const defaults = this._panelSizeDefaults || {
      minWidth: 200,
      maxWidth: 450,
      minHeight: 300,
      maxHeight: 600
    };
    const anchoredLayout = calculateAnchoredDisclosureLayout({
      anchorRect: toolbarRect,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      rightOffset: parseFloat(panelStyles.right) || 0,
      sizeDefaults: defaults,
      gap: 16,
      safeEdge: 8
    });

    this.panelElement.style.setProperty('--notes-panel-min-width', `${Math.round(anchoredLayout.minWidth)}px`);
    this.panelElement.style.setProperty('--notes-panel-max-width', `${Math.round(anchoredLayout.maxWidth)}px`);
    this.panelElement.style.setProperty('--notes-panel-min-height', `${Math.round(anchoredLayout.minHeight)}px`);
    this.panelElement.style.setProperty('--notes-panel-max-height', `${Math.round(anchoredLayout.maxHeight)}px`);
    this.panelElement.style.setProperty('--notes-panel-left', `${anchoredLayout.left}px`);
    this.panelElement.style.setProperty('--notes-panel-top', `${anchoredLayout.top}px`);
  }

  _setupResizeHandler(): void {
    const disposers = [this.listen(window, 'resize', () => this._schedulePositionUpdate())];

    if (this.streamContainer && typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => this._schedulePositionUpdate());
      this._resizeObserver.observe(this.streamContainer);
      disposers.push(this.observe(this._resizeObserver));
    }

    this.replaceManaged(LAYOUT_SETUP_LIFECYCLE, () => {
      for (let index = disposers.length - 1; index >= 0; index -= 1) {
        disposers[index]();
      }
      this._resizeObserver = null;
    });
  }

  _schedulePositionUpdate(): void {
    this.replaceTimeout(RESIZE_DEBOUNCE_TIMEOUT, () => {
      this.updatePosition();
    }, RESIZE_DEBOUNCE_MS);
  }

  _getPanelSizeDefaults(): AnchoredLayoutSizeDefaults | null {
    if (!this.panelElement) return null;

    const styles = window.getComputedStyle(this.panelElement);
    const minWidth = parseFloat(styles.minWidth);
    const maxWidth = parseFloat(styles.maxWidth);
    const minHeight = parseFloat(styles.minHeight);
    const maxHeight = parseFloat(styles.maxHeight);

    return {
      minWidth: Number.isFinite(minWidth) ? minWidth : 200,
      maxWidth: Number.isFinite(maxWidth) ? maxWidth : 450,
      minHeight: Number.isFinite(minHeight) ? minHeight : 300,
      maxHeight: Number.isFinite(maxHeight) ? maxHeight : 600
    };
  }

  override dispose(): void | Promise<void> {
    const disposed = super.dispose();
    this.panelElement = null;
    this.toolbarElement = null;
    this.streamContainer = null;
    this._resizeObserver = null;
    this._panelSizeDefaults = null;
    return disposed;
  }
}

export { NotesPanelLayoutComponent };
