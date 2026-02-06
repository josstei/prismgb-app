/**
 * Streaming Renderer Interface
 *
 * Contract for rendering strategies (GPU and Canvas2D).
 * Provides polymorphic behavior for renderer switching in the render pipeline.
 */

export class IStreamingRenderer {
  /**
   * Initialize the renderer with a canvas and resolution
   * @param {HTMLCanvasElement} _canvasElement - Canvas to render to
   * @param {Object} _nativeResolution - Native device resolution { width, height }
   * @returns {Promise<boolean>} True if initialization successful
   */
  async initialize(_canvasElement: any, _nativeResolution: any): Promise<boolean> {
    throw new Error('initialize() must be implemented');
  }

  /**
   * Render a video frame
   * @param {HTMLVideoElement} _videoElement - Video element to capture frame from
   * @returns {Promise<void>}
   */
  async renderFrame(_videoElement: any): Promise<void> {
    throw new Error('renderFrame() must be implemented');
  }

  /**
   * Resize the renderer to new dimensions
   * @param {number} _width - New width
   * @param {number} _height - New height
   */
  resize(_width: number, _height: number): void {
    throw new Error('resize() must be implemented');
  }

  /**
   * Check if renderer is currently active
   * @returns {boolean} True if rendering is active
   */
  isActive(): boolean {
    throw new Error('isActive() must be implemented');
  }

  /**
   * Pause rendering (window hidden)
   * @param {HTMLVideoElement} _videoElement - Video element for callback cancellation
   */
  pause(_videoElement: any): void {
    throw new Error('pause() must be implemented');
  }

  /**
   * Resume rendering (window visible)
   * @param {HTMLVideoElement} _videoElement - Video element for callback registration
   */
  resume(_videoElement: any): void {
    throw new Error('resume() must be implemented');
  }

  /**
   * Cleanup all resources
   */
  cleanup(): void {
    throw new Error('cleanup() must be implemented');
  }

  /**
   * Handle pipeline stop - renderer-specific cleanup when stream stops
   * Called before renderer is deactivated but after pause().
   * GPU: No-op (canvas recreation handled via CANVAS_EXPIRED event)
   * Canvas2D: Clear canvas to black to show idle state
   */
  handlePipelineStop(): void {
    // Default: no-op - renderers that need special stop handling override this
  }

  // ============================
  // Optional methods with defaults (GPU-specific)
  // ============================

  /**
   * Check if renderer supports shader presets
   * @returns {boolean} True if presets are supported
   */
  supportsPresets(): boolean {
    return false;
  }

  /**
   * Get current preset ID
   * @returns {string|null} Current preset ID, or null if not applicable
   */
  getPresetId(): string | null {
    return null;
  }

  /**
   * Set the active render preset
   * @param {string} _presetId - Preset ID to apply
   */
  setPreset(_presetId: string): void {
    // no-op for renderers that don't support presets
  }

  /**
   * Check if canvas control was transferred (irreversible)
   * @returns {boolean} True if canvas was transferred
   */
  isCanvasTransferred(): boolean {
    return false;
  }

  /**
   * Release GPU resources while keeping renderer alive
   * Used for memory savings when streaming stops
   * Note: Only GPU resources are released; the worker stays alive.
   */
  releaseGpuResources(): void {
    // no-op for renderers that don't have releasable resources
  }

  /**
   * Terminate and reset the renderer
   * @param {boolean} _emitCanvasExpired - Whether to emit canvas expired event
   */
  terminateAndReset(_emitCanvasExpired = true): void {
    // no-op, cleanup() is the standard method
  }
}
