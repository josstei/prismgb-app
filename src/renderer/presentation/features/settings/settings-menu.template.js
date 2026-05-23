/**
 * Settings Menu Template
 *
 * Extracted from header template for better maintainability.
 */

import { getIconSvg } from '@renderer/presentation/icons/icon.utils.js';
import { SettingsDefinitions } from '@shared/features/settings/settings.definitions.js';

function getRecordingFormatDefinition() {
  return getSettingDefinition('recordingFormat');
}

function getSettingDefinition(name) {
  const definition = SettingsDefinitions.definitions.find((setting) => setting.name === name);
  if (!definition) {
    throw new Error(`Missing ${name} settings definition`);
  }
  return definition;
}

function formatRecordingFormatLabel(format) {
  if (format === 'webm') {
    return 'WebM';
  }

  return format.toUpperCase();
}

export function getRecordingFormatOptions() {
  const definition = getRecordingFormatDefinition();
  const allowedValues = Array.isArray(definition.allowedValues) ? definition.allowedValues : [];

  return allowedValues.map((value) => ({
    value,
    label: formatRecordingFormatLabel(value),
    active: value === definition.default
  }));
}

function createRecordingFormatOptionsTemplate() {
  return getRecordingFormatOptions()
    .map((option) =>
      `<button type="button" class="settings-select-option${option.active ? ' active' : ''}" data-value="${option.value}" role="option" aria-selected="${option.active ? 'true' : 'false'}">${option.label}</button>`
    )
    .join('');
}

function getDefaultRecordingFormatLabel() {
  return getRecordingFormatOptions().find((option) => option.active)?.label || '';
}

function getSettingsUiDefinitions() {
  return SettingsDefinitions.definitions
    .filter((definition) => definition.ui?.controlId)
    .sort((a, b) => (a.ui.order ?? 0) - (b.ui.order ?? 0));
}

function createSettingTextTemplate(ui) {
  const title = ui.title || ui.label;

  if (!ui.hint) {
    return `<span>${title}</span>`;
  }

  return `
            <span class="settings-item-text">
              <span class="settings-item-title">${title}</span>
              <span class="settings-item-hint" id="${ui.hintId}">
                ${ui.hint}
              </span>
            </span>`;
}

function createCheckboxSettingTemplate(definition) {
  const { ui } = definition;
  const hintClass = ui.hint ? ' settings-item-with-hint' : '';
  const ariaDescription = ui.hintId ? ` aria-describedby="${ui.hintId}"` : '';

  return `
          <label class="settings-item toggle${hintClass}">
            ${createSettingTextTemplate(ui)}
            <input type="checkbox" id="${ui.controlId}"${ariaDescription}>
            <span class="toggle-slider"></span>
          </label>`;
}

function createListboxSettingTemplate(definition) {
  const { ui } = definition;
  const hintClass = ui.hint ? ' settings-item-with-hint' : '';

  return `
          <div class="settings-item${hintClass}">
            ${createSettingTextTemplate(ui)}
            <div class="settings-select-wrapper" aria-describedby="${ui.hintId}">
              <button type="button" class="settings-select-trigger" id="${ui.controlId}" aria-haspopup="listbox" aria-expanded="false">
                <span class="settings-select-label" id="${ui.labelId}">${getDefaultRecordingFormatLabel()}</span>
              </button>
              <div class="settings-select-menu" id="${ui.menuId}" role="listbox">
                ${createRecordingFormatOptionsTemplate()}
              </div>
            </div>
          </div>`;
}

function createSettingsControlTemplate(definition) {
  if (definition.ui.controlType === 'checkbox') {
    return createCheckboxSettingTemplate(definition);
  }

  if (definition.ui.controlType === 'listbox') {
    return createListboxSettingTemplate(definition);
  }

  throw new Error(`Unsupported settings control type: ${definition.ui.controlType}`);
}

export function createSettingsControlsTemplate() {
  return getSettingsUiDefinitions()
    .map((definition) => createSettingsControlTemplate(definition))
    .join('');
}

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
          ${createSettingsControlsTemplate()}
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
