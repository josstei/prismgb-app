import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLoginItemServiceMock, createLogger } from '../../../../factories/index.js';

vi.mock('electron', () => ({
  app: {
    getLoginItemSettings: vi.fn(() => ({ openAtLogin: false })),
    setLoginItemSettings: vi.fn()
  }
}));

import { IPC_CHANNELS, IpcContractManifest } from '@prismgb/ipc';
import { registerIpcHandlerDescriptors } from '@main/ipc/ipc-handler.descriptor.js';
import { loginItemHandlerDescriptors } from '@main/ipc/handlers/login-item.handler.js';

const loginItemInvokeManifest = IpcContractManifest.namespaces.find(({ namespace }) => namespace === 'LOGIN_ITEM')?.invoke ?? [];

describe('LoginItem IPC Handlers', () => {
  let mockRegisterHandler;
  let mockLoginItemService;
  let mockLogger;
  let handlers;

  beforeEach(() => {
    handlers = {};
    mockRegisterHandler = vi.fn((channel, handler) => {
      handlers[channel] = handler;
    });

    mockLoginItemService = createLoginItemServiceMock();
    mockLogger = createLogger();
    registerIpcHandlerDescriptors(mockRegisterHandler, { loginItemService: mockLoginItemService, logger: mockLogger }, loginItemHandlerDescriptors);
  });

  it('should register two handlers', () => {
    expect(mockRegisterHandler).toHaveBeenCalledTimes(2);
  });

  it('should expose descriptor metadata for result visibility', () => {
    expect(loginItemHandlerDescriptors.map(({ channel, argumentSchema, dependencyTokens, responseMode }) => [channel, argumentSchema ?? [], dependencyTokens, responseMode])).toEqual(loginItemInvokeManifest.map(({ channel, request, handler }) => [channel, request ?? [], handler?.dependencyTokens ?? [], handler?.responseMode]));

    expect(loginItemHandlerDescriptors).toEqual([
      expect.objectContaining({
        channel: IPC_CHANNELS.LOGIN_ITEM.GET,
        mapError: expect.any(Function)
      }),
      expect.objectContaining({
        channel: IPC_CHANNELS.LOGIN_ITEM.SET,
        mapError: expect.any(Function)
      })
    ]);
  });

  describe(IPC_CHANNELS.LOGIN_ITEM.GET, () => {
    it('returns login item state', async () => {
      mockLoginItemService.isEnabled.mockReturnValue(true);
      const result = await handlers[IPC_CHANNELS.LOGIN_ITEM.GET]({});
      expect(result).toEqual({ success: true, enabled: true });
      expect(mockLoginItemService.isEnabled).toHaveBeenCalled();
    });

    it('maps errors to a monadic response', async () => {
      mockLoginItemService.isEnabled.mockImplementation(() => { throw new Error('login item read failed'); });
      const result = await handlers[IPC_CHANNELS.LOGIN_ITEM.GET]({});
      expect(result).toEqual({ success: false, enabled: false, error: 'login item read failed' });
    });
  });

  describe(IPC_CHANNELS.LOGIN_ITEM.SET, () => {
    it('should enable login item', async () => {
      const result = await handlers[IPC_CHANNELS.LOGIN_ITEM.SET]({}, true);
      expect(mockLoginItemService.setEnabled).toHaveBeenCalledWith(true);
      expect(result).toEqual({ success: true });
    });

    it('maps errors to a result envelope', async () => {
      mockLoginItemService.setEnabled.mockImplementation(() => { throw new Error('login item update failed'); });
      const result = await handlers[IPC_CHANNELS.LOGIN_ITEM.SET]({}, false);
      expect(result).toEqual({ success: false, error: 'login item update failed' });
    });
  });
});
