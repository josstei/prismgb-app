import { describe, it, expect } from 'vitest';
import { IPC_CHANNELS as channelsJson } from '@platform/ipc';

type SortableObject = {
  readonly [key: string]: string | SortableObject;
};

type SortedObject = {
  [key: string]: string | SortedObject;
};

function sortObjectByKeys(source: SortableObject): SortedObject {
  return Object.keys(source)
    .sort()
    .reduce<SortedObject>((sorted, key) => {
      const value = source[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        sorted[key] = sortObjectByKeys(value);
      } else {
        sorted[key] = value;
      }
      return sorted;
    }, {});
}

describe('IPC channel baseline', () => {
  it('captures canonical manifest-derived namespace/shape snapshot', () => {
    expect(sortObjectByKeys(channelsJson)).toMatchInlineSnapshot(`
      {
        "DEVICE": {
          "CONNECTED": "device:connected",
          "DISCONNECTED": "device:disconnected",
        },
        "TRANSCODE": {
          "CANCELLED": "transcode:cancelled",
          "COMPLETED": "transcode:completed",
          "ERROR": "transcode:error",
          "PROGRESS": "transcode:progress",
        },
        "UPDATE": {
          "AVAILABLE": "update:available",
          "DOWNLOADED": "update:downloaded",
          "ERROR": "update:error",
          "NOT_AVAILABLE": "update:not-available",
          "PROGRESS": "update:progress",
        },
        "WINDOW": {
          "ENTER_FULLSCREEN": "window:enter-fullscreen",
          "LEAVE_FULLSCREEN": "window:leave-fullscreen",
          "RESIZED": "window:resized",
        },
      }
    `);
  });
});
