/**
 * Header Template
 *
 * Application header with logo, device status, and control buttons.
 */

import { getIconSvg } from '@renderer/ui/icons/icon.utils.js';

/**
 * Create header HTML
 * @returns {string} Header HTML string
 */
export default function createHeaderTemplate() {
  return `
    <header class="header">
      <div class="header-left">
        <h1>
          <img class="app-logo pixelated" src="/assets/Logo.png" width="120" height="30" alt="PrismGB">
        </h1>
        <div class="device-status" id="deviceStatus">
          <span class="status-indicator" id="statusIndicator"></span>
          <span id="statusText">Checking device...</span>
        </div>
      </div>
      <div class="header-right">
        <button class="btn btn-secondary" id="fullscreenBtn" aria-label="Toggle Fullscreen">
          ${getIconSvg('header-fullscreen')}
        </button>
        <div class="settings-control">
          <button class="btn btn-primary" id="settingsBtn" aria-label="Open Settings" aria-expanded="false">
            <span class="update-badge hidden" id="updateBadge"></span>
            ${getIconSvg('header-settings')}
          </button>
          <div class="settings-menu-container popup-animated" id="settingsMenuContainer">
            <div class="settings-menu" role="menu" aria-label="Settings">
              <!-- Settings Section -->
              <section class="settings-section settings-main">
                <h3 class="settings-section-title">Display</h3>
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
                    <span class="settings-item-title">Performance mode</span>
                    <span class="settings-item-hint" id="animationSaverHint">
                      Pause background effects to improve performance.
                    </span>
                  </span>
                  <input type="checkbox" id="settingAnimationSaver" aria-describedby="animationSaverHint">
                  <span class="toggle-slider"></span>
                </label>
              </section>

              <!-- Updates Section -->
              <section class="settings-section settings-updates" id="updateSection">
                <h3 class="settings-section-title">Updates</h3>
                <div class="update-content">
                  <div class="update-version-row">
                    <span class="update-label">Current Version</span>
                    <span class="update-current-version" id="updateCurrentVersion">v1.0.0</span>
                  </div>
                  <div class="update-status-row">
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
                <span class="settings-version" id="appVersion">v1.0.0</span>
                <div class="settings-footer-links">
                  <a href="#" id="linkGithub" class="settings-icon-link" aria-label="GitHub" title="GitHub">
                    ${getIconSvg('settings-github')}
                  </a>
                  <a href="#" id="linkWebsite" class="settings-icon-link" aria-label="Website" title="Website">
                    ${getIconSvg('settings-website')}
                  </a>
                  <button id="disclaimerBtn" class="settings-icon-link settings-info-btn" aria-label="Disclaimer & Credits" title="Disclaimer & Credits" aria-expanded="false">
                    ${getIconSvg('settings-disclaimer')}
                  </button>
                </div>
              </footer>
            </div>
            <!-- Disclaimer Tooltip - positioned below menu -->
            <div class="disclaimer-tooltip popup-animated" id="disclaimerContent">
              <p><strong>This is an unofficial, community-developed application.</strong></p>
              <p>PrismGB is not affiliated with, endorsed by, or sponsored by Mod Retro. The Chromatic is a product of Mod Retro.</p>
              <p>For official Chromatic support and information, please visit <a href="#" id="linkModRetro" class="disclaimer-link">modretro.com</a>.</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  `;
}
