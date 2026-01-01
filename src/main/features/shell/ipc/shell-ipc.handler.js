/**
 * Shell IPC Handlers
 * Registers shell-related IPC routes.
 */

import { channels as IPC_CHANNELS } from '@shared/ipc/channels.config.js';

export function registerShellHandlers({ registerHandler, shell, logger }) {
  registerHandler(IPC_CHANNELS.SHELL.OPEN_EXTERNAL, async (event, url) => {
    try {
      const parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Only http and https URLs are allowed');
      }
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      logger.error('Failed to open external URL:', error);
      return { success: false, error: error.message };
    }
  });
}
