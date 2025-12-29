/**
 * Centralized IPC channel names
 * Prevents typos and aids refactoring
 *
 * Single source of truth: channels.json
 */

import channelsData from './channels.json?raw';

const channels = JSON.parse(channelsData);

export { channels };
