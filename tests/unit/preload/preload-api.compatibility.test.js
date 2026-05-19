import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi } from 'vitest';
import channels from '@shared/ipc/channels.json';
import { createDevicePreloadAPI } from '@preload/apis/device.preload-api.js';
import { createWindowPreloadAPI } from '@preload/apis/window.preload-api.js';
import { createUpdatePreloadAPI } from '@preload/apis/update.preload-api.js';
import { createTranscodePreloadAPI } from '@preload/apis/transcode.preload-api.js';
import {
  createShellPreloadAPI,
  createMetricsPreloadAPI,
  createGpuPreloadAPI,
  createLoginItemPreloadAPI
} from '@preload/apis/inline.preload-api.js';
import { createListenerRegistry, MAX_LISTENERS_PER_CHANNEL } from '@preload/listener-registry.js';
import {
  isValidCallback,
  isValidError,
  isValidProgress,
  isValidTranscodeParams,
  isValidTranscodeProgress,
  isValidTranscodeResult,
  isValidFfmpegArgs,
  isValidUpdateInfo
} from '@preload/validators.js';

function createMockIpcRenderer(overrides = {}) {
  return {
    invoke: vi.fn(async (channel, payload) => {
      if (Object.prototype.hasOwnProperty.call(overrides, channel)) {
        const value = overrides[channel];
        if (typeof value === 'function') {
          return value(channel, payload);
        }
        return value;
      }
      return { success: true };
    }),
    on: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn()
  };
}

function createAPIWithRegistry(factory, ipcRenderer, options = {}) {
  return factory({
    ipcRenderer,
    channels,
    listenerRegistry: createListenerRegistry(),
    maxListeners: MAX_LISTENERS_PER_CHANNEL,
    ...options
  });
}

describe('Preload API invoke compatibility baselines', () => {
  it('forwards device status invoke call to device:get-status with no args', async () => {
    const expectedResponse = { connected: true, device: { deviceName: 'Chromatic USB' } };
    const ipcRenderer = createMockIpcRenderer({
      [channels.DEVICE.GET_STATUS]: expectedResponse
    });

    const deviceAPI = createAPIWithRegistry(
      createDevicePreloadAPI,
      ipcRenderer,
      { isValidCallback }
    );

    const status = await deviceAPI.getStatus();

    expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(channels.DEVICE.GET_STATUS);
    expect(status).toEqual(expectedResponse);
    expect(status).toEqual(
      expect.objectContaining({
        connected: expect.any(Boolean)
      })
    );
  });

  it('forwards window invoke calls to the expected channels', async () => {
    const expectedPolicyResponse = { success: true };
    const expectedFullscreenResponse = { success: true };
    const expectedFullscreenState = true;

    const ipcRenderer = createMockIpcRenderer({
      [channels.WINDOW.SET_FULLSCREEN]: expectedPolicyResponse,
      [channels.WINDOW.IS_FULLSCREEN]: expectedFullscreenState
    });

    const windowAPI = createAPIWithRegistry(
      createWindowPreloadAPI,
      ipcRenderer,
      { isValidCallback }
    );

    const setFullscreenResult = await windowAPI.setFullScreen(true);
    const isFullScreenResult = await windowAPI.isFullScreen();

    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(1, channels.WINDOW.SET_FULLSCREEN, true);
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(2, channels.WINDOW.IS_FULLSCREEN);
    expect(setFullscreenResult).toEqual(expectedPolicyResponse);
    expect(setFullscreenResult.success).toBe(true);
    expect(isFullScreenResult).toBe(expectedFullscreenState);
  });

  it('forwards update invoke calls and preserves update contract-shaped responses', async () => {
    const expectedGetStatus = {
      success: true,
      state: 'idle',
      updateInfo: null,
      downloadProgress: null
    };
    const expectedCheck = { success: true, updateAvailable: false, skipped: false };
    const expectedDownload = { success: true };
    const expectedInstall = { success: true };

    const ipcRenderer = createMockIpcRenderer({
      [channels.UPDATE.GET_STATUS]: expectedGetStatus,
      [channels.UPDATE.CHECK]: expectedCheck,
      [channels.UPDATE.DOWNLOAD]: expectedDownload,
      [channels.UPDATE.INSTALL]: expectedInstall
    });

    const updateAPI = createAPIWithRegistry(
      createUpdatePreloadAPI,
      ipcRenderer,
      { isValidCallback, isValidUpdateInfo, isValidProgress, isValidError }
    );

    const getStatusResult = await updateAPI.getStatus();
    const checkResult = await updateAPI.checkForUpdates();
    const downloadResult = await updateAPI.downloadUpdate();
    const installResult = await updateAPI.installUpdate();

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(channels.UPDATE.GET_STATUS);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(channels.UPDATE.CHECK);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(channels.UPDATE.DOWNLOAD);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(channels.UPDATE.INSTALL);
    expect(getStatusResult).toEqual(expectedGetStatus);
    expect(checkResult).toEqual(expectedCheck);
    expect(downloadResult).toEqual(expectedDownload);
    expect(installResult).toEqual(expectedInstall);
  });

  it('forwards transcode start payloads and forwards status responses', async () => {
    const inputBuffer = new ArrayBuffer(4);
    const startResponse = {
      success: true,
      jobId: 'job-1',
      filePath: '/tmp/job-1.mp4'
    };
    const statusResponse = {
      success: true,
      job: {
        id: 'job-1',
        state: 'running',
        progress: 0,
        outputPath: '/tmp/job-1.mp4',
        error: null,
        startTime: 1712345678000
      },
      jobs: [
        {
          id: 'job-1',
          state: 'running',
          progress: 0,
          outputPath: '/tmp/job-1.mp4',
          error: null,
          startTime: 1712345678000
        }
      ]
    };

    const ipcRenderer = createMockIpcRenderer({
      [channels.TRANSCODE.START]: startResponse,
      [channels.TRANSCODE.CANCEL]: { success: true },
      [channels.TRANSCODE.GET_STATUS]: statusResponse
    });

    const transcodeAPI = createAPIWithRegistry(
      createTranscodePreloadAPI,
      ipcRenderer,
      {
        isValidCallback,
        isValidError,
        isValidTranscodeProgress,
        isValidTranscodeResult,
        isValidTranscodeParams,
        isValidFfmpegArgs
      }
    );

    const startResult = await transcodeAPI.start(
      inputBuffer,
      'mp4',
      'job-1.mp4',
      {
        inputArgs: ['-hide_banner'],
        interrupted: true
      }
    );
    const cancelResult = await transcodeAPI.cancel('job-1');
    const statusResult = await transcodeAPI.getStatus();

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      channels.TRANSCODE.START,
      {
        inputBuffer,
        format: 'mp4',
        outputFilename: 'job-1.mp4',
        inputArgs: ['-hide_banner'],
        interrupted: true
      }
    );
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(channels.TRANSCODE.CANCEL, { jobId: 'job-1' });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(channels.TRANSCODE.GET_STATUS);

    expect(startResult).toEqual(startResponse);
    expect(cancelResult).toEqual({ success: true });
    expect(statusResult).toEqual(statusResponse);
    expect(statusResult.job).toMatchObject({
      id: expect.any(String),
      state: expect.any(String),
      startTime: expect.any(Number)
    });
    expect(Array.isArray(statusResult.jobs)).toBe(true);
  });

  it('documents transcode.getStatus jobId drift: optional jobId is declared but not forwarded', async () => {
    const ipcRenderer = createMockIpcRenderer({
      [channels.TRANSCODE.GET_STATUS]: { success: true }
    });

    const transcodeAPI = createAPIWithRegistry(
      createTranscodePreloadAPI,
      ipcRenderer,
      {
        isValidCallback,
        isValidError,
        isValidTranscodeProgress,
        isValidTranscodeResult,
        isValidTranscodeParams,
        isValidFfmpegArgs
      }
    );

    await transcodeAPI.getStatus('job-1');

    expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(channels.TRANSCODE.GET_STATUS);
    expect(ipcRenderer.invoke.mock.calls[0]).toHaveLength(1);
  });

  it('documents transcode.getStatus declaration drift: d.ts still accepts optional jobId', () => {
    const preloadTypes = fs.readFileSync(
      path.resolve(process.cwd(), 'src/types/preload-api.d.ts'),
      'utf8'
    );

    expect(preloadTypes).toContain('getStatus(jobId?: string): Promise<TranscodeStatusResponse>;');
  });
});

describe('Preload inline API compatibility baselines', () => {
  it('forwards shell, metrics, GPU, and login item invokes', async () => {
    const metricsResponse = {
      success: true,
      timestamp: 1712345678000,
      totalKB: 1000,
      totalMB: '1.0',
      processCount: 1,
      processes: [
        {
          type: 'Browser',
          pid: 123,
          memoryKB: 1000,
          memoryMB: '1.0',
          peakMemoryKB: 1200,
          peakMemoryMB: '1.2',
          cpuPercent: 0.5
        }
      ]
    };

    const ipcRenderer = createMockIpcRenderer({
      [channels.SHELL.OPEN_EXTERNAL]: { success: true },
      [channels.PERFORMANCE.GET_METRICS]: metricsResponse,
      [channels.GPU.GET_POLICY]: { success: true, skipWebGPU: true, reason: 'compat-test' },
      [channels.LOGIN_ITEM.GET]: true,
      [channels.LOGIN_ITEM.SET]: { success: true }
    });

    const shellAPI = createShellPreloadAPI({
      ipcRenderer,
      channels,
      isValidExternalUrl: (url) => /^https?:\/\//.test(url)
    });
    const metricsAPI = createMetricsPreloadAPI({ ipcRenderer, channels });
    const gpuAPI = createGpuPreloadAPI({ ipcRenderer, channels, isValidGpuPolicy: () => true });
    const loginItemAPI = createLoginItemPreloadAPI({ ipcRenderer, channels });

    await expect(shellAPI.openExternal('https://example.com')).resolves.toEqual({ success: true });
    await expect(metricsAPI.getProcessMetrics()).resolves.toEqual(metricsResponse);
    await expect(gpuAPI.getPolicy()).resolves.toEqual({
      skipWebGPU: true,
      reason: 'compat-test'
    });
    await expect(loginItemAPI.get()).resolves.toBe(true);
    await expect(loginItemAPI.set(true)).resolves.toEqual({ success: true });

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(channels.SHELL.OPEN_EXTERNAL, 'https://example.com');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(channels.PERFORMANCE.GET_METRICS);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(channels.GPU.GET_POLICY);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(channels.LOGIN_ITEM.GET);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(channels.LOGIN_ITEM.SET, true);
  });

  it('captures inline API validation and fallback responses', async () => {
    const ipcRenderer = createMockIpcRenderer({
      [channels.GPU.GET_POLICY]: { success: false, error: 'not available' }
    });

    const shellAPI = createShellPreloadAPI({
      ipcRenderer,
      channels,
      isValidExternalUrl: () => false
    });
    const gpuAPI = createGpuPreloadAPI({ ipcRenderer, channels, isValidGpuPolicy: () => false });
    const loginItemAPI = createLoginItemPreloadAPI({ ipcRenderer, channels });

    await expect(shellAPI.openExternal('file:///tmp/test')).resolves.toEqual({
      success: false,
      error: 'Invalid URL'
    });
    await expect(gpuAPI.getPolicy()).resolves.toEqual({
      skipWebGPU: false,
      reason: null
    });
    await expect(loginItemAPI.set('yes')).resolves.toEqual({
      success: false,
      error: 'Invalid parameter'
    });

    expect(ipcRenderer.invoke).not.toHaveBeenCalledWith(channels.SHELL.OPEN_EXTERNAL, expect.anything());
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(channels.GPU.GET_POLICY);
    expect(ipcRenderer.invoke).not.toHaveBeenCalledWith(channels.LOGIN_ITEM.SET, expect.anything());
  });
});
