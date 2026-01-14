/**
 * Stream Viewer Template
 *
 * Video/canvas streaming view with overlays, toolbar, and fullscreen controls.
 */

import { getIconSvg } from '@renderer/ui/icons/icon.utils.js';
import overlayIconUrl from '/overlay-icons/default.svg?url';

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

/**
 * Create shader dropdown panel with controls
 * @returns {string} Shader panel HTML string
 */
export function createShaderPanelTemplate() {
  return `
    <div class="shader-panel" id="shaderDropdown">
      <div class="panel-content">
        <div class="shader-controls-container">
          <div class="shader-unavailable-message hidden" id="shaderUnavailableMessage">
            <svg class="perf-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
            <span>Performance Mode</span>
          </div>
          <div class="shader-options"></div>
          <div class="brightness-control">
            <div class="brightness-icon">
              ${getIconSvg('shader-brightness')}
            </div>
            <input type="range" min="0" max="100" value="50" class="brightness-slider" id="brightnessSlider" aria-label="Brightness level">
            <span class="brightness-percentage" id="brightnessPercentage">50%</span>
          </div>
          <div class="volume-control-vertical">
            <div class="volume-icon">
              ${getIconSvg('shader-volume')}
            </div>
            <input type="range" min="0" max="100" value="70" class="volume-slider-vertical" id="volumeSliderVertical" aria-label="Volume level">
            <span class="volume-percentage-vertical" id="volumePercentageVertical">70%</span>
          </div>
        </div>
        <div class="panel-divider"></div>
        <button type="button" class="cinematic-pill" id="cinematicToggle" aria-pressed="false">
          <span class="cinematic-pill-text">Cinematic Off</span>
        </button>
      </div>
    </div>
  `;
}

/**
 * Create main toolbar with buttons
 * @returns {string} Toolbar HTML string
 */
export function createToolbarTemplate() {
  return `
    <div class="stream-toolbar" id="streamToolbar">
      <!-- Shader Button + Panel -->
      <div class="toolbar-item toolbar-capture" id="shaderControls">
        <button class="toolbar-btn" id="shaderBtn" aria-label="Shader Selection" aria-expanded="false">
          ${getIconSvg('toolbar-shader')}
        </button>
        ${createShaderPanelTemplate()}
      </div>

      <!-- Screenshot Button -->
      <button class="toolbar-btn toolbar-capture toolbar-screenshot" id="screenshotBtn" aria-label="Take Screenshot" disabled>
        ${getIconSvg('toolbar-screenshot')}
      </button>

      <!-- Record Button -->
      <button class="toolbar-btn toolbar-capture toolbar-record" id="recordBtn" aria-label="Start Recording" aria-pressed="false" disabled>
        <!-- Normal record dot icon -->
        <span class="record-dot">${getIconSvg('toolbar-record')}</span>
        <!-- Recording state: static dot + spinning outer ring -->
        <span class="record-spinner">${getIconSvg('toolbar-record-active')}</span>
        <!-- Transcode progress ring -->
        <span class="transcode-ring" id="transcodeRing" aria-hidden="true"></span>
        <span class="transcode-percent-label" id="transcodePercentLabel"></span>
      </button>

      <!-- Notes Button -->
      <button class="toolbar-btn toolbar-capture toolbar-notes" id="notesBtn" aria-label="Notes" aria-expanded="false">
        ${getIconSvg('toolbar-notes')}
      </button>
    </div>
  `;
}

/**
 * Create fullscreen exit button
 * @returns {string} Fullscreen controls HTML string
 */
export function createFullscreenControlsTemplate() {
  return `
    <div class="fullscreen-controls" id="fullscreenControls">
      <button class="fs-control-btn" id="fsExitBtn" aria-label="Exit fullscreen">
        ${getIconSvg('overlay-fullscreen-exit')}
      </button>
    </div>
  `;
}

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
