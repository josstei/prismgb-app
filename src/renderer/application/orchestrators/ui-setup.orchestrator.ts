/**
 * UI Setup Orchestrator
 *
 * Coordinates canvas lifecycle management
 *
 * Responsibilities:
 * - Handle canvas recreation events (GPU worker reinitialization)
 * - Rebind click handlers to new canvas instances
 */

import { BaseOrchestrator } from '@prismgb/core';
import { createDomListenerManager } from '@renderer/presentation/primitives/dom-listener.utils.js';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { EventChannels } from '@renderer/common/config/event-channels';

export class UISetupOrchestrator extends BaseOrchestrator {
  static readonly dependencies = [
    'appState',
    'eventBus',
    'loggerFactory'
  ] as const;

  constructor(dependencies) {
    super(
      dependencies,
      [...UISetupOrchestrator.dependencies],
      'UISetupOrchestrator'
    );

    // DOM listener manager for cleanup (separate from EventBus subscriptions)
    this._domListeners = createDomListenerManager({ logger: this.logger });

    // Store stop stream handler so it can be reused during canvas recreation
    this._stopStreamHandler = null;
  }

  /**
   * Initialize orchestrator - subscribe to canvas recreation events
   */
  async onInitialize() {
    this.subscribeWithCleanup({
      [EventChannels.RENDER.CANVAS_RECREATED]: (data: { oldCanvas: HTMLCanvasElement; newCanvas: HTMLCanvasElement }) => this._handleCanvasRecreated(data)
    });
  }

  /**
   * Handle canvas recreation event
   * Removes listeners from old canvas and adds them to new canvas
   * @param {Object} data - Event data with oldCanvas and newCanvas
   * @private
   */
  _handleCanvasRecreated({ oldCanvas, newCanvas }: { oldCanvas: HTMLCanvasElement; newCanvas: HTMLCanvasElement }) {
    // Remove listeners from old canvas to allow GC
    const removed = this._domListeners.removeByTarget(oldCanvas);
    this.logger.debug(`Removed ${removed} listener(s) from old canvas`);

    // Add click handler to new canvas
    if (this._stopStreamHandler) {
      this._domListeners.add(newCanvas, 'click', this._stopStreamHandler);
      this.logger.debug('Rebound click handler to new canvas');
    }
  }

  /**
   * Set up click handlers for overlay and video elements
   * Called once during application startup
   * @param {Object} elements - DOM element references
   */
  setupOverlayClickHandlers(elements) {
    const { streamOverlay, streamVideo, streamCanvas } = elements;

    this._domListeners.add(streamOverlay, 'click', () => {
      if (streamOverlay.classList.contains(CSSClasses.HIDDEN)) {
        return;
      }
      this.logger.info('Overlay clicked - requesting stream start');
      this.eventBus.publish(EventChannels.UI.STREAM_START_REQUESTED);
    });

    // Store handler so it can be reused during canvas recreation
    this._stopStreamHandler = () => {
      if (!this.appState.isStreaming) {
        return;
      }
      this.logger.info('Stream clicked - requesting stream stop');
      this.eventBus.publish(EventChannels.UI.STREAM_STOP_REQUESTED);
    };

    this._domListeners.add(streamVideo, 'click', this._stopStreamHandler);
    this._domListeners.add(streamCanvas, 'click', this._stopStreamHandler);

    this.logger.info('Overlay click handlers initialized');
  }

  /**
   * Cleanup resources
   */
  async onCleanup() {
    this.logger.info('Cleaning up UISetupOrchestrator...');
    this._domListeners.removeAll();
    this.logger.info('UISetupOrchestrator cleanup complete');
  }
}
