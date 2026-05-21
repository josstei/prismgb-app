import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const channelsPath = path.join(projectRoot, 'src/shared/ipc/channels.json');

function deepFreeze(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

export function readSharedIpcChannels() {
  return JSON.parse(fs.readFileSync(channelsPath, 'utf8'));
}

export const IPC_CHANNELS = deepFreeze(readSharedIpcChannels());
