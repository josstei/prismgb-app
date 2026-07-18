/**
 * Header Template
 *
 * Application header with logo, device status, and control buttons.
 */

import { getIconSvg } from '@renderer/presentation/icons/icon.utils.js';
import { createSettingsMenuTemplate } from '@renderer/presentation/features/settings/settings-menu.template.js';
import logoUrl from '/Logo.png?url';

export default function createHeaderTemplate(): string {
  return `
    <header class="header">
      <div class="header-left">
        <h1>
          <img class="app-logo pixelated" src="${logoUrl}" width="120" height="30" alt="PrismGB">
        </h1>
        <div class="device-status" id="deviceStatus">
          <span class="status-indicator" id="statusIndicator" data-ref="statusIndicator"></span>
          <span id="statusText" data-ref="statusText">Checking device...</span>
        </div>
      </div>
      <div class="header-right">
        <button class="btn btn-secondary" id="fullscreenBtn" data-ref="fullscreenBtn" data-action="fullscreen.toggle" aria-label="Toggle Fullscreen">
          ${getIconSvg('header-fullscreen')}
        </button>
        <div class="settings-control">
          <button class="btn btn-primary" id="settingsBtn" data-ref="settingsBtn" data-action="settings.toggle" aria-label="Open Settings" aria-expanded="false">
            <span class="update-badge hidden" id="updateBadge" data-ref="updateBadge"></span>
            ${getIconSvg('header-settings')}
          </button>
          ${createSettingsMenuTemplate()}
        </div>
      </div>
    </header>
  `;
}
