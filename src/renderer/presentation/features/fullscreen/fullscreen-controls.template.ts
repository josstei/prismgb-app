/**
 * Fullscreen Controls Template
 *
 * Exit button overlay for fullscreen mode.
 * Extracted from stream-viewer.template.js for feature separation.
 */

import { getIconSvg } from '@renderer/presentation/icons/icon.utils.js';

export function createFullscreenControlsTemplate(): string {
  return `
    <div class="fullscreen-controls" id="fullscreenControls" data-ref="fullscreenControls">
      <button class="fs-control-btn" id="fsExitBtn" data-ref="fsExitBtn" data-action="fullscreen.toggle" aria-label="Exit fullscreen">
        ${getIconSvg('overlay-fullscreen-exit')}
      </button>
    </div>
  `;
}
