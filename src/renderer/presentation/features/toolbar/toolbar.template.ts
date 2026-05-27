/**
 * Toolbar Template
 *
 * Streaming toolbar with capture buttons and shader controls.
 * Extracted from stream-viewer.template.js for feature separation.
 */

import { getIconSvg } from '@renderer/presentation/icons/icon.utils.js';

export function createShaderPanelTemplate(): string {
  return `
    <div class="shader-panel" id="shaderDropdown" data-ref="shaderDropdown">
      <div class="panel-content">
        <div class="shader-controls-container">
          <div class="shader-unavailable-message hidden" id="shaderUnavailableMessage" data-ref="shaderUnavailableMessage">
            <svg class="perf-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
            <span>Performance Mode</span>
          </div>
          <div class="shader-options" id="shaderOptions" data-ref="shaderOptions"></div>
          <div class="brightness-control" id="brightnessControl" data-ref="brightnessControl">
            <div class="brightness-icon">
              ${getIconSvg('shader-brightness')}
            </div>
            <input type="range" min="0" max="100" value="50" class="brightness-slider" id="brightnessSlider" data-ref="brightnessSlider" aria-label="Brightness level">
            <span class="brightness-percentage" id="brightnessPercentage" data-ref="brightnessPercentage">50%</span>
          </div>
          <div class="volume-control-vertical">
            <div class="volume-icon">
              ${getIconSvg('shader-volume')}
            </div>
            <input type="range" min="0" max="100" value="70" class="volume-slider-vertical" id="volumeSliderVertical" data-ref="volumeSliderVertical" aria-label="Volume level">
            <span class="volume-percentage-vertical" id="volumePercentageVertical" data-ref="volumePercentageVertical">70%</span>
          </div>
        </div>
        <div class="panel-divider"></div>
        <button type="button" class="cinematic-pill" id="cinematicToggle" data-ref="cinematicToggle" aria-pressed="false">
          <span class="cinematic-pill-text" id="cinematicPillText" data-ref="cinematicPillText">Cinematic Off</span>
        </button>
      </div>
    </div>
  `;
}

export function createToolbarTemplate(): string {
  return `
    <div class="stream-toolbar" id="streamToolbar" data-ref="streamToolbar">
      <!-- Shader Button + Panel -->
      <div class="toolbar-item toolbar-capture" id="shaderControls" data-ref="shaderControls">
        <button class="toolbar-btn" id="shaderBtn" data-ref="shaderBtn" data-action="shader.toggle" aria-label="Shader Selection" aria-expanded="false">
          ${getIconSvg('toolbar-shader')}
        </button>
        ${createShaderPanelTemplate()}
      </div>

      <!-- Screenshot Button -->
      <button class="toolbar-btn toolbar-capture toolbar-screenshot" id="screenshotBtn" data-ref="screenshotBtn" data-action="capture.screenshot" aria-label="Take Screenshot" disabled>
        ${getIconSvg('toolbar-screenshot')}
      </button>

      <!-- Record Button -->
      <button class="toolbar-btn toolbar-capture toolbar-record" id="recordBtn" data-ref="recordBtn" data-action="recording.toggle" aria-label="Start Recording" aria-pressed="false" disabled>
        <!-- Normal record dot icon -->
        <span class="record-dot">${getIconSvg('toolbar-record')}</span>
        <!-- Recording state: static dot + spinning outer ring -->
        <span class="record-spinner">${getIconSvg('toolbar-record-active')}</span>
        <!-- Transcode progress ring -->
        <span class="transcode-ring" id="transcodeRing" data-ref="transcodeRing" aria-hidden="true"></span>
        <span class="transcode-percent-label" id="transcodePercentLabel" data-ref="transcodePercentLabel"></span>
      </button>

      <!-- Notes Button -->
      <button class="toolbar-btn toolbar-capture toolbar-notes" id="notesBtn" data-ref="notesBtn" data-action="notes.toggle" aria-label="Notes" aria-expanded="false">
        ${getIconSvg('toolbar-notes')}
      </button>
    </div>
  `;
}
