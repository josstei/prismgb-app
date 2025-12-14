/**
 * Centralized IPC channel names
 * Prevents typos and aids refactoring
 *
 * Single source of truth: channels.json
 */

// Import JSON file - Vite will handle this in both dev and production
import channelsData from './channels.json?raw';

const channels = JSON.parse(channelsData);

export default channels;
