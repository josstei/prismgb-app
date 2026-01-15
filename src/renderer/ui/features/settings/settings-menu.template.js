/**
 * Settings Menu Template
 *
 * Extracted from header template for better maintainability.
 */

import { getIconSvg } from '@renderer/ui/icons/icon.utils.js';

/**
 * Create settings menu HTML
 * @returns {string} Settings menu HTML string
 */
export function createSettingsMenuTemplate() {
  return `
    <div class="settings-menu-container popup-animated" id="settingsMenuContainer">
      <div class="settings-menu" role="menu" aria-label="Settings">
        <!-- Settings Section -->
        <section class="settings-section settings-main">
          <label class="settings-item toggle">
            <span>Show Status Bar</span>
            <input type="checkbox" id="settingStatusStrip">
            <span class="toggle-slider"></span>
          </label>
          <label class="settings-item toggle">
            <span>Fullscreen on startup</span>
            <input type="checkbox" id="settingFullscreenOnStartup">
            <span class="toggle-slider"></span>
          </label>
          <label class="settings-item toggle settings-item-with-hint">
            <span class="settings-item-text">
              <span class="settings-item-title">Auto-start stream</span>
              <span class="settings-item-hint" id="autoStreamHint">
                Automatically start streaming when device connects.
              </span>
            </span>
            <input type="checkbox" id="settingAutoStreamOnConnect" aria-describedby="autoStreamHint">
            <span class="toggle-slider"></span>
          </label>
          <label class="settings-item toggle settings-item-with-hint">
            <span class="settings-item-text">
              <span class="settings-item-title">Minimalist fullscreen</span>
              <span class="settings-item-hint" id="minimalistFullscreenHint">
                Black background while streaming.
              </span>
            </span>
            <input type="checkbox" id="settingMinimalistFullscreen" aria-describedby="minimalistFullscreenHint">
            <span class="toggle-slider"></span>
          </label>
          <label class="settings-item toggle settings-item-with-hint">
            <span class="settings-item-text">
              <span class="settings-item-title">Performance mode</span>
              <span class="settings-item-hint" id="animationSaverHint">
                Use basic renderer for lower CPU.
              </span>
            </span>
            <input type="checkbox" id="settingAnimationSaver" aria-describedby="animationSaverHint">
            <span class="toggle-slider"></span>
          </label>
          <div class="settings-item settings-item-with-hint">
            <span class="settings-item-text">
              <span class="settings-item-title">Recording format</span>
              <span class="settings-item-hint" id="recordingFormatHint">
                Output format for video recordings.
              </span>
            </span>
            <div class="settings-select-wrapper" aria-describedby="recordingFormatHint">
              <button type="button" class="settings-select-trigger" id="settingRecordingFormat" aria-haspopup="listbox" aria-expanded="false">
                <span class="settings-select-label" id="recordingFormatLabel">WebM</span>
              </button>
              <div class="settings-select-menu" id="recordingFormatMenu" role="listbox">
                <button type="button" class="settings-select-option active" data-value="webm" role="option" aria-selected="true">WebM</button>
                <button type="button" class="settings-select-option" data-value="mp4" role="option" aria-selected="false">MP4</button>
                <button type="button" class="settings-select-option" data-value="mov" role="option" aria-selected="false">MOV</button>
              </div>
            </div>
          </div>
        </section>

        <div class="settings-divider"></div>

        <!-- Updates Section -->
        <section class="settings-section settings-updates" id="updateSection">
          <div class="update-content">
            <div class="update-status-row">
              <span class="update-current-version" id="updateCurrentVersion">v1.0.0</span>
              <span class="update-status-indicator" id="updateStatusIndicator"></span>
              <span class="update-status-text" id="updateStatusText">Up to date</span>
            </div>
            <div class="update-progress-container hidden" id="updateProgressContainer">
              <div class="update-progress-bar">
                <div class="update-progress-fill" id="updateProgressFill"></div>
              </div>
              <span class="update-progress-text" id="updateProgressText">0%</span>
            </div>
            <button class="btn btn-sm btn-primary update-action-btn" id="updateActionBtn">
              Check for Updates
            </button>
          </div>
        </section>

        <!-- Compact Footer -->
        <footer class="settings-footer">
          <div class="settings-footer-links">
            <a href="#" id="linkGithub" class="settings-icon-link" aria-label="GitHub" title="GitHub">
              ${getIconSvg('settings-github')}
            </a>
            <a href="#" id="linkWebsite" class="settings-icon-link" aria-label="Website" title="Website">
              ${getIconSvg('settings-website')}
            </a>
            <a href="#" id="linkX" class="settings-icon-link" aria-label="X" title="X">
              ${getIconSvg('settings-x')}
            </a>
            <button id="disclaimerBtn" class="settings-icon-link settings-info-btn" aria-label="Disclaimer & Credits" title="Disclaimer & Credits" aria-expanded="false">
              ${getIconSvg('settings-disclaimer')}
            </button>
          </div>
          <button id="linkKofi" class="settings-support-btn" aria-label="Support the Developer">
            ${getIconSvg('settings-kofi')} Support the Developer
          </button>
        </footer>
      </div>
      <!-- Disclaimer Tooltip - positioned below menu -->
      <div class="disclaimer-tooltip popup-animated" id="disclaimerContent">
        <p><strong>This is an unofficial, community-developed application.</strong></p>
        <p>PrismGB is not affiliated with, endorsed by, or sponsored by Mod Retro. The Chromatic is a product of Mod Retro.</p>
        <p>For official Chromatic support and information, please visit <a href="#" id="linkModRetro" class="disclaimer-link">modretro.com</a>.</p>
      </div>
    </div>
  `;
}
