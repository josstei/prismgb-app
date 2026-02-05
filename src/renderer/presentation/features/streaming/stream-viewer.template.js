/**
 * Stream Viewer Template
 *
 * Video/canvas streaming view with overlays.
 * Toolbar and fullscreen controls are now in their own features.
 */

import overlayIconUrl from '/overlay-icons/default.svg?url';
import { createToolbarTemplate } from '@renderer/presentation/features/toolbar/toolbar.template.js';
import { createFullscreenControlsTemplate } from '@renderer/presentation/features/fullscreen/fullscreen-controls.template.js';

/**
 * Create stream overlay with particles, scanlines, and icon
 * @returns {string} Stream overlay HTML string
 */
export function createOverlayTemplate() {
  return `
    <div class="stream-overlay" id="streamOverlay">
      <!-- Floating Particles -->
      <div class="overlay-particles" aria-hidden="true">
        <span class="particle particle-1"></span>
        <span class="particle particle-2"></span>
        <span class="particle particle-3"></span>
        <span class="particle particle-4"></span>
        <span class="particle particle-5"></span>
        <span class="particle particle-6"></span>
      </div>

      <!-- Scanline shimmer effect (full viewport) -->
      <div class="scanlines" aria-hidden="true"></div>

      <!-- Main Content -->
      <div class="overlay-content">
        <div class="icon-wrapper">
          <!-- Pulsing rings for ready state -->
          <div class="ready-ring ready-ring-inner" aria-hidden="true"></div>
          <div class="ready-ring ready-ring-outer" aria-hidden="true"></div>
          <div class="ready-ring ready-ring-ripple" aria-hidden="true"></div>
          <!-- Radial glow behind gem -->
          <div class="gem-glow" aria-hidden="true"></div>
          <!-- Flash overlay for transition -->
          <div class="ready-flash" aria-hidden="true"></div>
          <img class="overlay-icon pixelated" src="${overlayIconUrl}" width="150" height="150" alt="">
        </div>
        <!-- Hidden but kept for JS state management -->
        <p id="overlayMessage" class="sr-only waiting">Click to start</p>
      </div>
    </div>
  `;
}

// Re-export for backwards compatibility
export { createToolbarTemplate, createFullscreenControlsTemplate };

/**
 * Create stream viewer HTML (includes toolbar and fullscreen controls)
 * @returns {string} Stream viewer HTML string
 */
export default function createStreamViewerTemplate() {
  return `
    <div class="stream-container" id="streamContainer">
      <video id="streamVideo" autoplay playsinline></video>
      <canvas id="streamCanvas" class="pixelated"></canvas>
      ${createOverlayTemplate()}
      ${createToolbarTemplate()}
      ${createFullscreenControlsTemplate()}
    </div>
  `;
}
