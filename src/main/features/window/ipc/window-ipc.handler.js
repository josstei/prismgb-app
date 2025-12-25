/**
 * Window IPC Handlers
 * Handles window-related IPC messages (fullscreen, etc.)
 */

import IPC_CHANNELS from '@infrastructure/ipc/channels.json' with { type: 'json' };

/**
 * Register window-related IPC handlers
 * @param {Object} options
 * @param {Function} options.registerHandler - Function to register an IPC handler
 * @param {WindowService} options.windowService - Window service instance
 * @param {Object} options.logger - Logger instance
 */
export function registerWindowHandlers({ registerHandler, windowService, logger }) {
  registerHandler(IPC_CHANNELS.WINDOW.SET_FULLSCREEN, async (event, enabled) => {
    logger.debug(`Setting fullscreen: ${enabled}`);
    windowService.setFullScreen(enabled);
    return { success: true };
  });
}
