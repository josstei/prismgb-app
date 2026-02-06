/**
 * Header Template
 *
 * Application header with logo, device status, and control buttons.
 */

import { getIconSvg } from '@renderer/presentation/icons/icon.utils.js';
import { createSettingsMenuTemplate } from '@renderer/presentation/features/settings/settings-menu.template.js';
import logoUrl from '/Logo.png?url';

/**
 * Create header HTML
 * @returns {string} Header HTML string
 */
export default function createHeaderTemplate() {
  return `
    <header class="header">
      <div class="header-left">
        <h1>
          <img class="app-logo pixelated" src="${logoUrl}" width="120" height="30" alt="PrismGB">
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
          ${createSettingsMenuTemplate()}
        </div>
      </div>
    </header>
  `;
}
