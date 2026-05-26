import { describe, it, expect } from 'vitest';
import { IPC_CHANNELS as channelsJson } from '@shared/ipc/ipc.manifest.js';

function sortObjectByKeys(source) {
  return Object.keys(source)
    .sort()
    .reduce((sorted, key) => {
      const value = source[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        sorted[key] = Object.keys(value)
          .sort()
          .reduce((sortedValue, nestedKey) => {
            sortedValue[nestedKey] = value[nestedKey];
            return sortedValue;
          }, {});
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
          "GET_STATUS": "device:get-status",
        },
        "GPU": {
          "GET_POLICY": "gpu:get-policy",
        },
        "LOGIN_ITEM": {
          "GET": "login-item:get",
          "SET": "login-item:set",
        },
        "PERFORMANCE": {
          "GET_METRICS": "performance:get-metrics",
        },
        "SHELL": {
          "OPEN_EXTERNAL": "shell:open-external",
        },
        "TRANSCODE": {
          "CANCEL": "transcode:cancel",
          "CANCELLED": "transcode:cancelled",
          "COMPLETED": "transcode:completed",
          "ERROR": "transcode:error",
          "GET_STATUS": "transcode:get-status",
          "PROGRESS": "transcode:progress",
          "START": "transcode:start",
        },
        "UPDATE": {
          "AVAILABLE": "update:available",
          "CHECK": "update:check",
          "DOWNLOAD": "update:download",
          "DOWNLOADED": "update:downloaded",
          "ERROR": "update:error",
          "GET_STATUS": "update:get-status",
          "INSTALL": "update:install",
          "NOT_AVAILABLE": "update:not-available",
          "PROGRESS": "update:progress",
        },
        "WINDOW": {
          "ENTER_FULLSCREEN": "window:enter-fullscreen",
          "IS_FULLSCREEN": "window:is-fullscreen",
          "LEAVE_FULLSCREEN": "window:leave-fullscreen",
          "RESIZED": "window:resized",
          "SET_FULLSCREEN": "window:set-fullscreen",
        },
      }
    `);
  });
});
