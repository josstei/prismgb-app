/**
 * Window IPC Handlers
 * Handles window-related IPC messages (fullscreen, etc.)
 */

import IPC_CHANNELS from '@infrastructure/ipc/channels.json' with { type: 'json' };

/**
 * Register window-related IPC handlers
 * @param {Object} options
 * @param {Function} options.registerHandler - Function to register an IPC handler
 * @param {WindowManager} options.windowManager - Window manager instance
 * @param {Object} options.logger - Logger instance
 */
export function registerWindowHandlers({ registerHandler, windowManager, logger }) {
  registerHandler(IPC_CHANNELS.WINDOW.SET_FULLSCREEN, async (event, enabled) => {
    logger.debug(`Setting fullscreen: ${enabled}`);
    windowManager.setFullScreen(enabled);
    return { success: true };
  });
}
