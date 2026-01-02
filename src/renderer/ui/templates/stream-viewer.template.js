/**
 * Stream Viewer Template
 *
 * Video/canvas streaming view with overlays, toolbar, and fullscreen controls.
 */

import { getIconSvg } from '@renderer/ui/icons/icon.utils.js';

/**
 * Create stream viewer HTML (includes toolbar and fullscreen controls)
 * @returns {string} Stream viewer HTML string
 */
export default function createStreamViewerTemplate() {
  return `
    <div class="stream-container" id="streamContainer">
      <video id="streamVideo" autoplay playsinline></video>
      <canvas id="streamCanvas" class="pixelated"></canvas>
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
            <img class="overlay-icon pixelated" src="/assets/overlay-icons/default.svg" width="150" height="150" alt="">
          </div>
          <!-- Hidden but kept for JS state management -->
          <p id="overlayMessage" class="sr-only waiting">Click to start</p>
        </div>
      </div>

      <!-- Stream Toolbar -->
      <div class="stream-toolbar" id="streamToolbar">
        <!-- Shader Button + Panel -->
        <div class="toolbar-item toolbar-capture" id="shaderControls">
          <button class="toolbar-btn" id="shaderBtn" aria-label="Shader Selection" aria-expanded="false">
            ${getIconSvg('toolbar-shader')}
          </button>
          <div class="shader-panel" id="shaderDropdown">
            <div class="panel-content">
              <div class="shader-controls-container">
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
        </button>

        <!-- Notes Button -->
        <button class="toolbar-btn toolbar-capture toolbar-notes" id="notesBtn" aria-label="Notes" aria-expanded="false">
          ${getIconSvg('toolbar-notes')}
        </button>
      </div>

      <!-- Floating Fullscreen Controls (visible only in fullscreen mode) -->
      <div class="fullscreen-controls" id="fullscreenControls">
        <button class="fs-control-btn" id="fsExitBtn" aria-label="Exit fullscreen">
          ${getIconSvg('overlay-fullscreen-exit')}
        </button>
      </div>
    </div>
  `;
}
