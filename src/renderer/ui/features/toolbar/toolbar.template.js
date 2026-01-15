/**
 * Toolbar Template
 *
 * Streaming toolbar with capture buttons and shader controls.
 * Extracted from stream-viewer.template.js for feature separation.
 */

import { getIconSvg } from '@renderer/ui/icons/icon.utils.js';

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
          <div class="shader-options" id="shaderOptions"></div>
          <div class="brightness-control" id="brightnessControl">
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
          <span class="cinematic-pill-text" id="cinematicPillText">Cinematic Off</span>
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
