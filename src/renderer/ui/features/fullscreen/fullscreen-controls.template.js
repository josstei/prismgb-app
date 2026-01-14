/**
 * Fullscreen Controls Template
 *
 * Exit button overlay for fullscreen mode.
 * Extracted from stream-viewer.template.js for feature separation.
 */

import { getIconSvg } from '@renderer/ui/icons/icon.utils.js';

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

export default createFullscreenControlsTemplate;
