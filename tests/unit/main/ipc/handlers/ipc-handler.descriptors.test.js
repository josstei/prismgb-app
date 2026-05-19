import { beforeEach, describe, expect, it, vi } from 'vitest';

import IPC_CHANNELS from '@shared/ipc/channels.json';
import { registerIpcHandlerDescriptors } from '@main/ipc/ipc-handler.descriptor.js';
import {
  deviceHandlerDescriptors,
  shellHandlerDescriptors,
  updateHandlerDescriptors,
  windowHandlerDescriptors,
  transcodeHandlerDescriptors,
  performanceHandlerDescriptors,
  gpuHandlerDescriptors,
  loginItemHandlerDescriptors
} from '@main/ipc/handlers/index.js';

function captureHandlers(descriptors, deps) {
  const handlers = {};
  registerIpcHandlerDescriptors(
    (channel, handler) => {
      handlers[channel] = handler;
    },
    deps,
    descriptors
  );
  return handlers;
}

const mockLogger = {
  debug: vi.fn(),
  error: vi.fn()
};

const mockDeviceService = {
  getStatus: vi.fn()
};

const mockUpdateService = {
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  installUpdate: vi.fn(),
  getStatus: vi.fn()
};

const mockWindowService = {
  setFullScreen: vi.fn(),
  isFullScreen: vi.fn()
};

const mockTranscodeService = {
  transcode: vi.fn(),
  cancel: vi.fn(),
  getStatus: vi.fn()
};

const mockLoginItemService = {
  isEnabled: vi.fn(),
  setEnabled: vi.fn()
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Main IPC handler descriptors', () => {
  it('keeps descriptor metadata discoverable for migrated domains', () => {
    expect(deviceHandlerDescriptors.map((descriptor) => descriptor.channel)).toEqual([
      IPC_CHANNELS.DEVICE.GET_STATUS
    ]);
    expect(shellHandlerDescriptors.map((descriptor) => descriptor.channel)).toEqual([
      IPC_CHANNELS.SHELL.OPEN_EXTERNAL
    ]);
    expect(updateHandlerDescriptors.map((descriptor) => descriptor.channel)).toEqual([
      IPC_CHANNELS.UPDATE.CHECK,
      IPC_CHANNELS.UPDATE.DOWNLOAD,
      IPC_CHANNELS.UPDATE.INSTALL,
      IPC_CHANNELS.UPDATE.GET_STATUS
    ]);
    expect(windowHandlerDescriptors.map((descriptor) => descriptor.channel)).toEqual([
      IPC_CHANNELS.WINDOW.SET_FULLSCREEN,
      IPC_CHANNELS.WINDOW.IS_FULLSCREEN
    ]);
    expect(transcodeHandlerDescriptors.map((descriptor) => descriptor.channel)).toEqual([
      IPC_CHANNELS.TRANSCODE.START,
      IPC_CHANNELS.TRANSCODE.CANCEL,
      IPC_CHANNELS.TRANSCODE.GET_STATUS
    ]);
    expect(performanceHandlerDescriptors.map((descriptor) => descriptor.channel)).toEqual([
      IPC_CHANNELS.PERFORMANCE.GET_METRICS
    ]);
    expect(gpuHandlerDescriptors.map((descriptor) => descriptor.channel)).toEqual([
      IPC_CHANNELS.GPU.GET_POLICY
    ]);
    expect(loginItemHandlerDescriptors.map((descriptor) => descriptor.channel)).toEqual([
      IPC_CHANNELS.LOGIN_ITEM.GET,
      IPC_CHANNELS.LOGIN_ITEM.SET
    ]);
  });

  it('requires explicit mapError handlers for migrated descriptors', () => {
    const allDescriptors = [
      ...deviceHandlerDescriptors,
      ...shellHandlerDescriptors,
      ...updateHandlerDescriptors,
      ...windowHandlerDescriptors,
      ...transcodeHandlerDescriptors,
      ...performanceHandlerDescriptors,
      ...gpuHandlerDescriptors,
      ...loginItemHandlerDescriptors
    ];

    expect(allDescriptors.length).toBe(15);
    allDescriptors.forEach((descriptor) => {
      expect(typeof descriptor.mapError).toBe('function');
    });
  });

  it('preserves representative device response shapes', async () => {
    mockDeviceService.getStatus.mockReturnValue({ connected: true, device: { deviceName: 'Chromatic' } });

    const handlers = captureHandlers(deviceHandlerDescriptors, {
      deviceService: mockDeviceService,
      logger: mockLogger
    });

    const status = await handlers[IPC_CHANNELS.DEVICE.GET_STATUS]();
    expect(status).toEqual({ connected: true, device: { deviceName: 'Chromatic' } });

    mockDeviceService.getStatus.mockImplementation(() => {
      throw new Error('device fail');
    });

    const errorStatus = await handlers[IPC_CHANNELS.DEVICE.GET_STATUS]();
    expect(errorStatus).toEqual({ connected: false, error: 'device fail' });
  });

  it('maps shell responses with explicit success/error envelopes', async () => {
    const mockShell = {
      openExternal: vi.fn().mockResolvedValue(undefined)
    };

    const handlers = captureHandlers(shellHandlerDescriptors, {
      shell: mockShell,
      logger: mockLogger
    });

    const success = await handlers[IPC_CHANNELS.SHELL.OPEN_EXTERNAL]({}, 'https://example.com');

    expect(success).toEqual({ success: true });

    const error = await handlers[IPC_CHANNELS.SHELL.OPEN_EXTERNAL]({}, 'ftp://example.com');
    expect(error).toEqual({ success: false, error: 'Only http and https URLs are allowed' });
  });

  it('preserves update, transcode, and GPU response envelopes on failure', async () => {
    const updateHandlers = captureHandlers(updateHandlerDescriptors, {
      updateService: {
        ...mockUpdateService,
        checkForUpdates: vi.fn(() => Promise.reject(new Error('update failure')))
      },
      logger: mockLogger
    });

    const updateError = await updateHandlers[IPC_CHANNELS.UPDATE.CHECK]();
    expect(updateError).toEqual({ success: false, error: 'update failure' });

    const transcodeHandlers = captureHandlers(transcodeHandlerDescriptors, {
      transcodeService: {
        ...mockTranscodeService,
        transcode: vi.fn(() => Promise.reject(new Error('transcode failure')))
      },
      logger: mockLogger
    });

    const transcodeError = await transcodeHandlers[IPC_CHANNELS.TRANSCODE.START]({}, {
      inputBuffer: Buffer.from('x'),
      format: 'mp4',
      interrupted: false
    });

    expect(transcodeError).toEqual({ success: false, error: 'transcode failure' });

    const gpuHandlers = captureHandlers(gpuHandlerDescriptors, {
      logger: mockLogger
    });

    const gpuResponse = await gpuHandlers[IPC_CHANNELS.GPU.GET_POLICY]();
    expect(gpuResponse.success).toBe(true);
  });

  it('uses window and login item boolean/bare response modes', async () => {
    const windowHandlers = captureHandlers(windowHandlerDescriptors, {
      windowService: {
        ...mockWindowService,
        isFullScreen: vi.fn(() => true)
      },
      logger: mockLogger
    });

    const isFullscreen = await windowHandlers[IPC_CHANNELS.WINDOW.IS_FULLSCREEN]();
    expect(isFullscreen).toBe(true);

    const setFullscreen = await windowHandlers[IPC_CHANNELS.WINDOW.SET_FULLSCREEN]({}, true);
    expect(setFullscreen).toEqual({ success: true });

    const loginItemHandlers = captureHandlers(loginItemHandlerDescriptors, {
      loginItemService: {
        ...mockLoginItemService,
        isEnabled: vi.fn(() => false)
      },
      logger: mockLogger
    });

    const loginItemValue = await loginItemHandlers[IPC_CHANNELS.LOGIN_ITEM.GET]();
    expect(loginItemValue).toBe(false);
  });

  it('uses explicit performance and transcode error envelopes', async () => {
    const performanceHandlers = captureHandlers(performanceHandlerDescriptors, {
      app: {
        getAppMetrics: vi.fn(() => {
          throw new Error('metrics failure');
        })
      },
      logger: mockLogger
    });

    const metricsError = await performanceHandlers[IPC_CHANNELS.PERFORMANCE.GET_METRICS]();
    expect(metricsError).toEqual({ success: false, error: 'metrics failure' });

    const transcodeHandlers = captureHandlers(transcodeHandlerDescriptors, {
      transcodeService: {
        ...mockTranscodeService,
        cancel: vi.fn(() => {
          throw new Error('cancel failure');
        })
      },
      logger: mockLogger
    });

    const transcodeCancelError = await transcodeHandlers[IPC_CHANNELS.TRANSCODE.CANCEL]({}, { jobId: 'abc' });
    expect(transcodeCancelError).toEqual({ success: false, error: 'cancel failure' });
  });
});
