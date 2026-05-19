import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getLoginItemSettings: vi.fn(() => ({ openAtLogin: false })),
    setLoginItemSettings: vi.fn()
  }
}));

vi.mock('@shared/ipc/channels.config.js', () => ({
  channels: {
    LOGIN_ITEM: {
      GET: 'login-item:get',
      SET: 'login-item:set'
    }
  }
}));

import {
  loginItemHandlerDescriptors,
  registerLoginItemHandlers
} from '@main/ipc/handlers/login-item.handler.js';

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

    mockLoginItemService = {
      isEnabled: vi.fn(() => false),
      setEnabled: vi.fn()
    };

    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    registerLoginItemHandlers({
      registerHandler: mockRegisterHandler,
      loginItemService: mockLoginItemService,
      logger: mockLogger
    });
  });

  it('should register two handlers', () => {
    expect(mockRegisterHandler).toHaveBeenCalledTimes(2);
  });

  it('should expose descriptor metadata for result visibility', () => {
    expect(loginItemHandlerDescriptors).toEqual([
      expect.objectContaining({
        channel: 'login-item:get',
        dependencyTokens: ['loginItemService'],
        argumentSchema: [],
        responseMode: 'bare',
        mapError: expect.any(Function)
      }),
      expect.objectContaining({
        channel: 'login-item:set',
        dependencyTokens: ['loginItemService', 'logger'],
        argumentSchema: ['enabled:boolean'],
        responseMode: 'result-envelope',
        mapError: expect.any(Function)
      })
    ]);
  });

  describe('login-item:get', () => {
    it('returns login item state', async () => {
      mockLoginItemService.isEnabled.mockReturnValue(true);

      const result = await handlers['login-item:get']({});
      expect(result).toBe(true);
      expect(mockLoginItemService.isEnabled).toHaveBeenCalled();
    });

    it('maps errors to a boolean response', async () => {
      mockLoginItemService.isEnabled.mockImplementation(() => {
        throw new Error('login item read failed');
      });

      const result = await handlers['login-item:get']({});
      expect(result).toEqual(false);
    });
  });

  describe('login-item:set', () => {
    it('should enable login item', async () => {
      const result = await handlers['login-item:set']({}, true);

      expect(mockLoginItemService.setEnabled).toHaveBeenCalledWith(true);
      expect(result).toEqual({ success: true });
    });

    it('maps errors to a result envelope', async () => {
      mockLoginItemService.setEnabled.mockImplementation(() => {
        throw new Error('login item update failed');
      });

      const result = await handlers['login-item:set']({}, false);

      expect(result).toEqual({ success: false, error: 'login item update failed' });
    });
  });
});
