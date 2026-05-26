import { beforeEach, describe, expect, it, vi } from 'vitest';

import IPC_CHANNELS from '@shared/ipc/channels.json';
import { IpcContractManifest } from '@shared/ipc/ipc.manifest.js';
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
import { createLogger } from '../../../../factories/index.js';

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

const mockLogger = createLogger({ name: 'IpcHandlerDescriptors' });

const mockDeviceService = { getStatus: vi.fn() };
const mockUpdateService = { checkForUpdates: vi.fn(), downloadUpdate: vi.fn(), installUpdate: vi.fn(), getStatus: vi.fn() };
const mockWindowService = { setFullScreen: vi.fn(), isFullScreen: vi.fn() };
const mockTranscodeService = { transcode: vi.fn(), cancel: vi.fn(), getStatus: vi.fn() };
const mockLoginItemService = { isEnabled: vi.fn(), setEnabled: vi.fn() };

const descriptorGroups = [
  ['DEVICE', deviceHandlerDescriptors], ['SHELL', shellHandlerDescriptors], ['UPDATE', updateHandlerDescriptors], ['WINDOW', windowHandlerDescriptors],
  ['TRANSCODE', transcodeHandlerDescriptors], ['PERFORMANCE', performanceHandlerDescriptors], ['GPU', gpuHandlerDescriptors], ['LOGIN_ITEM', loginItemHandlerDescriptors]
];
const allDescriptors = descriptorGroups.flatMap(([, descriptors]) => descriptors);
const manifestInvokeEntries = (namespaceKey) => IpcContractManifest.namespaces.find(({ namespace }) => namespace === namespaceKey).invoke;

beforeEach(() => { vi.clearAllMocks(); });

describe('Main IPC handler descriptors', () => {
  it('derives descriptor metadata from manifest invoke entries', () => {
    descriptorGroups.forEach(([namespaceKey, descriptors]) => {
      const invokeEntriesByChannel = new Map(manifestInvokeEntries(namespaceKey).map((entry) => [entry.channel, entry]));
      expect(descriptors.length).toBe(invokeEntriesByChannel.size);

      descriptors.forEach((descriptor) => {
        const invokeEntry = invokeEntriesByChannel.get(descriptor.channel);
        expect(invokeEntry).toBeDefined();
        expect(descriptor.argumentSchema ?? []).toEqual(invokeEntry.request ?? []);
        expect(descriptor.dependencyTokens).toEqual(invokeEntry.handler?.dependencyTokens ?? []);
        expect(descriptor.responseMode).toBe(invokeEntry.handler?.responseMode);
      });
    });
  });

  it('requires explicit mapError handlers for migrated descriptors', () => {
    expect(allDescriptors.length).toBe(IpcContractManifest.namespaces.reduce((count, namespace) => count + namespace.invoke.length, 0));
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

    const transcodeService = {
      transcode: vi.fn(() => Promise.reject(new Error('transcode failure'))),
      cancel: vi.fn(),
      getStatus: vi.fn()
    };
    const transcodeHandlers = captureHandlers(transcodeHandlerDescriptors, { transcodeService, logger: mockLogger });

    const transcodeError = await transcodeHandlers[IPC_CHANNELS.TRANSCODE.START]({}, {
      inputBuffer: Buffer.from('x'),
      format: 'mp4',
      interrupted: false
    });

    expect(transcodeError).toEqual({ success: false, error: 'transcode failure' });
    expect(await transcodeHandlers[IPC_CHANNELS.TRANSCODE.START]({}, [])).toEqual({ success: false, error: 'argument options must be object' });
    expect(transcodeService.transcode).toHaveBeenCalledTimes(1);

    const gpuHandlers = captureHandlers(gpuHandlerDescriptors, {
      logger: mockLogger
    });

    const gpuResponse = await gpuHandlers[IPC_CHANNELS.GPU.GET_POLICY]();
    expect(gpuResponse.success).toBe(true);
  });

  it('uses window and login item boolean/bare response modes', async () => {
    const windowService = {
      setFullScreen: vi.fn(),
      isFullScreen: vi.fn(() => true)
    };
    const windowHandlers = captureHandlers(windowHandlerDescriptors, { windowService, logger: mockLogger });

    const isFullscreen = await windowHandlers[IPC_CHANNELS.WINDOW.IS_FULLSCREEN]();
    expect(isFullscreen).toBe(true);

    const setFullscreen = await windowHandlers[IPC_CHANNELS.WINDOW.SET_FULLSCREEN]({}, true);
    expect(setFullscreen).toEqual({ success: true });
    expect(await windowHandlers[IPC_CHANNELS.WINDOW.SET_FULLSCREEN]({}, 'yes')).toEqual({ success: false, error: 'argument enabled must be boolean' });
    expect(await windowHandlers[IPC_CHANNELS.WINDOW.IS_FULLSCREEN]({}, true)).toBe(false);
    expect(windowService.setFullScreen).toHaveBeenCalledTimes(1);
    expect(windowService.isFullScreen).toHaveBeenCalledTimes(1);

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
