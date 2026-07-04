import { IPC_CHANNELS as manifestChannels } from '../.generated/ipc.mjs';

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
  return JSON.parse(JSON.stringify(manifestChannels));
}

export const IPC_CHANNELS = deepFreeze(readSharedIpcChannels());
