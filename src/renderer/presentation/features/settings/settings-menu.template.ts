import { getIconSvg } from '@renderer/presentation/icons/icon.utils.js';
import {
  getSettingsListboxOptions,
  getSettingsUiDefinitions,
  hasSettingsListboxControl,
  type SettingsControlDefinition,
  type SettingsControlUi,
  type SettingsListboxDefinition
} from '@renderer/lib/settings.definitions.js';
import { escapeHtml } from '@prismgb/core';
import { TRANSCODE_CONFIG } from '@prismgb/transcode';

function createListboxOptionsTemplate(options: ReturnType<typeof getSettingsListboxOptions>): string {
  return options
    .map((option) => {
      const value = escapeHtml(option.value);
      const label = escapeHtml(option.label);
      return `<button type="button" class="settings-select-option${option.active ? ' active' : ''}" data-value="${value}" role="option" aria-selected="${option.active ? 'true' : 'false'}">${label}</button>`;
    })
    .join('');
}

function createSettingTextTemplate(ui: SettingsControlUi): string {
  const title = escapeHtml(ui.title || ui.label);

  if (!ui.hint) {
    return `<span>${title}</span>`;
  }

  return `
            <span class="settings-item-text">
              <span class="settings-item-title">${title}</span>
              <span class="settings-item-hint" id="${escapeHtml(ui.hintId)}">
                ${escapeHtml(ui.hint)}
              </span>
            </span>`;
}

function createCheckboxSettingTemplate(definition: SettingsControlDefinition): string {
  const { ui } = definition;
  const hintClass = ui.hint ? ' settings-item-with-hint' : '';
  const ariaDescription = ui.hintId ? ` aria-describedby="${escapeHtml(ui.hintId)}"` : '';

  return `
          <label class="settings-item toggle${hintClass}">
            ${createSettingTextTemplate(ui)}
            <input type="checkbox" id="${ui.controlId}" data-ref="${ui.controlId}"${ariaDescription}>
            <span class="toggle-slider"></span>
          </label>`;
}

function createListboxSettingTemplate(definition: SettingsListboxDefinition): string {
  const { ui } = definition;
  const hintClass = ui.hint ? ' settings-item-with-hint' : '';
  const ariaDescription = ui.hintId ? ` aria-describedby="${escapeHtml(ui.hintId)}"` : '';
  const options = getSettingsListboxOptions(definition);
  const defaultLabel = escapeHtml(options.find((option) => option.active)?.label);

  return `
          <div class="settings-item${hintClass}">
            ${createSettingTextTemplate(ui)}
            <div class="settings-select-wrapper"${ariaDescription}>
              <button type="button" class="settings-select-trigger" id="${ui.controlId}" data-ref="${ui.controlId}" aria-haspopup="listbox" aria-expanded="false">
                <span class="settings-select-label" id="${ui.labelId}" data-ref="${ui.labelId}">${defaultLabel}</span>
              </button>
              <div class="settings-select-menu" id="${ui.menuId}" data-ref="${ui.menuId}" role="listbox">
                ${createListboxOptionsTemplate(options)}
              </div>
            </div>
          </div>`;
}

function createSettingsControlTemplate(definition: SettingsControlDefinition): string {
  if (definition.ui.controlType === 'checkbox') {
    return createCheckboxSettingTemplate(definition);
  }

  if (hasSettingsListboxControl(definition)) {
    return createListboxSettingTemplate(definition);
  }

  throw new Error(`Unsupported settings control type: ${definition.ui.controlType}`);
}

export function createSettingsControlsTemplate(): string {
  return getSettingsUiDefinitions()
    .map((definition) => createSettingsControlTemplate(definition))
    .join('');
}

export function createSettingsMenuTemplate(): string {
  return `
    <div class="settings-menu-container popup-animated" id="settingsMenuContainer" data-ref="settingsMenuContainer">
      <div class="settings-menu" role="menu" aria-label="Settings">
        <section class="settings-section settings-main">
          ${createSettingsControlsTemplate()}
        </section>

        <div class="settings-divider"></div>

        <section class="settings-section settings-updates" id="updateSection" data-ref="updateSection">
          <div class="update-content">
            <div class="update-status-row">
              <span class="update-current-version" id="updateCurrentVersion" data-ref="updateCurrentVersion">v1.0.0</span>
              <span class="update-status-indicator" id="updateStatusIndicator" data-ref="updateStatusIndicator"></span>
              <span class="update-status-text" id="updateStatusText" data-ref="updateStatusText">Up to date</span>
            </div>
            <div class="update-progress-container hidden" id="updateProgressContainer" data-ref="updateProgressContainer">
              <div class="update-progress-bar">
                <div class="update-progress-fill" id="updateProgressFill" data-ref="updateProgressFill"></div>
              </div>
              <span class="update-progress-text" id="updateProgressText" data-ref="updateProgressText">0%</span>
            </div>
            <button class="btn btn-sm btn-primary update-action-btn" id="updateActionBtn" data-ref="updateActionBtn">
              Check for Updates
            </button>
          </div>
        </section>

        <footer class="settings-footer">
          <div class="settings-footer-links">
            <a href="#" id="linkGithub" data-ref="linkGithub" data-action="external.github" class="settings-icon-link" aria-label="GitHub" title="GitHub">
              ${getIconSvg('settings-github')}
            </a>
            <a href="#" id="linkWebsite" data-ref="linkWebsite" data-action="external.website" class="settings-icon-link" aria-label="Website" title="Website">
              ${getIconSvg('settings-website')}
            </a>
            <a href="#" id="linkX" data-ref="linkX" data-action="external.x" class="settings-icon-link" aria-label="X" title="X">
              ${getIconSvg('settings-x')}
            </a>
            <button id="disclaimerBtn" data-ref="disclaimerBtn" class="settings-icon-link settings-info-btn" aria-label="Disclaimer & Credits" title="Disclaimer & Credits" aria-expanded="false">
              ${getIconSvg('settings-disclaimer')}
            </button>
          </div>
          <button id="linkKofi" data-ref="linkKofi" data-action="external.kofi" class="settings-support-btn" aria-label="Support the Developer">
            ${getIconSvg('settings-kofi')} Support the Developer
          </button>
        </footer>
      </div>
      <div class="disclaimer-tooltip popup-animated" id="disclaimerContent" data-ref="disclaimerContent">
        <p><strong>This is an unofficial, community-developed application.</strong></p>
        <p>PrismGB is not affiliated with, endorsed by, or sponsored by Mod Retro. The Chromatic is a product of Mod Retro.</p>
        <p>For official Chromatic support and information, please visit <a href="#" id="linkModRetro" data-ref="linkModRetro" data-action="external.modretro" class="disclaimer-link">modretro.com</a>.</p>
      </div>
    </div>
  `;
}

export function getRecordingFormatOptions(): Array<{ value: string; label: string; active?: boolean }> {
  return Object.keys(TRANSCODE_CONFIG.formats).map((format) => ({
    value: format,
    label: format === 'webm' ? 'WebM' : format.toUpperCase(),
    active: format === 'webm'
  }));
}
