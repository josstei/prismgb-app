/**
 * SettingsFullscreenService Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
vi.mock('@renderer/infrastructure/ipc/trpc-client', async () => ({
  trpcClient: (await import('../../../../support/mocks/trpc-client.mock')).createTrpcClientMock()
}));

import { SettingsFullscreenService } from '@renderer/infrastructure/services/settings/settings-fullscreen.service';
import { EventChannels } from '@platform/events';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import { emitTrpcData, getTrpcUnsubscribe } from '../../../../support/mocks/trpc-client.mock';
import { installFullscreenDocumentMock } from '../../../../support/mocks/browser-api.installers.js';
import { createInjectableHarness } from '../../../../support/di/injectable.harness.js';

describe('SettingsFullscreenService', () => {
  let service;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;
  let mockDocument;
  let mockDocumentElement;
  let documentMock;

  beforeEach(() => {

    vi.mocked(trpcClient.window.isFullScreen.query)
      .mockReset()
      .mockResolvedValue({ isFullscreen: false });
    vi.mocked(trpcClient.window.setFullScreen.mutate)
      .mockReset()
      .mockResolvedValue(undefined);

    documentMock = installFullscreenDocumentMock();
    mockDocument = documentMock.document;
    mockDocumentElement = documentMock.documentElement;

    const h = createInjectableHarness(SettingsFullscreenService);
    service = h.subject;
    mockLogger = h.logger;
    ({ eventBus: mockEventBus, loggerFactory: mockLoggerFactory } = h.deps);
  });

  afterEach(() => {
    documentMock?.cleanup();
  });

  describe('constructor', () => {
    it('should create service with required dependencies', () => {
      expect(service.eventBus).toBe(mockEventBus);
      expect(service.logger).toBe(mockLogger);
    });

    it('should initialize internal state', () => {
      expect(service._isFullscreenActive).toBe(false);
      expect(service._boundHandleFullscreenChange).toBeTypeOf('function');
    });
  });

  describe('initialize', () => {
    it('should add fullscreenchange event listener', () => {
      service.initialize();

      expect(mockDocument.addEventListener).toHaveBeenCalledWith(
        'fullscreenchange',
        service._boundHandleFullscreenChange
      );
    });

    it('should subscribe to native fullscreen tRPC events', () => {
      service.initialize();

      expect(trpcClient.window.onEnterFullscreen.subscribe).toHaveBeenCalledWith(
        undefined,
        { onData: expect.any(Function) }
      );
      expect(trpcClient.window.onLeaveFullscreen.subscribe).toHaveBeenCalledWith(
        undefined,
        { onData: expect.any(Function) }
      );
      expect(trpcClient.window.onResized.subscribe).toHaveBeenCalledWith(
        undefined,
        { onData: expect.any(Function) }
      );
    });

    it('should bind the fullscreen toggle-requested event handler', () => {
      service.initialize();

      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_TOGGLE_REQUESTED,
        expect.any(Function)
      );
    });

    it('should register document, native, and event-handler lifecycle disposables', () => {
      service.initialize();

      expect(service.disposables.size).toBe(3);
    });

    it('should sync fullscreen state via tRPC query', () => {
      service.initialize();

      expect(trpcClient.window.isFullScreen.query).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('should remove fullscreenchange event listener', async () => {
      await service.dispose();

      expect(mockDocument.removeEventListener).toHaveBeenCalledWith(
        'fullscreenchange',
        service._boundHandleFullscreenChange
      );
    });

    it('should dispose bridge-owned native fullscreen subscriptions', async () => {
      await service.dispose();

      expect(getTrpcUnsubscribe(trpcClient.window.onEnterFullscreen)).toHaveBeenCalled();
      expect(getTrpcUnsubscribe(trpcClient.window.onLeaveFullscreen)).toHaveBeenCalled();
      expect(getTrpcUnsubscribe(trpcClient.window.onResized)).toHaveBeenCalled();
    });

    it('should handle dispose when not initialized', async () => {
      const uninitializedService = new SettingsFullscreenService(mockEventBus, mockLoggerFactory);

      await expect(uninitializedService.dispose()).resolves.toBeUndefined();
    });
  });

  describe('toggleFullscreen', () => {
    it('should enter fullscreen when not currently fullscreen', async () => {
      vi.mocked(trpcClient.window.isFullScreen.query).mockResolvedValue({ isFullscreen: false });

      await service.toggleFullscreen();

      expect(trpcClient.window.setFullScreen.mutate).toHaveBeenCalledWith(true);
    });

    it('should exit fullscreen when already fullscreen', async () => {
      vi.mocked(trpcClient.window.isFullScreen.query).mockResolvedValue({ isFullscreen: true });

      await service.toggleFullscreen();

      expect(trpcClient.window.setFullScreen.mutate).toHaveBeenCalledWith(false);
    });

    it('should toggle fullscreen when FULLSCREEN_TOGGLE_REQUESTED is published', async () => {
      service.initialize();
      vi.mocked(trpcClient.window.isFullScreen.query).mockResolvedValue({ isFullscreen: false });

      mockEventBus.publish(EventChannels.UI.FULLSCREEN_TOGGLE_REQUESTED);

      await vi.waitFor(() => {
        expect(trpcClient.window.setFullScreen.mutate).toHaveBeenCalledWith(true);
      });
    });
  });

  describe('_syncFullscreenState', () => {
    it('should use tRPC isFullScreen query and apply the reported state', async () => {
      vi.mocked(trpcClient.window.isFullScreen.query).mockResolvedValue({ isFullscreen: true });

      const result = await service._syncFullscreenState();

      expect(trpcClient.window.isFullScreen.query).toHaveBeenCalled();
      expect(result).toBe(true);
      expect(service._isFullscreenActive).toBe(true);
    });

    it('should handle query errors and return the current state', async () => {
      const error = new Error('Query failed');
      vi.mocked(trpcClient.window.isFullScreen.query).mockRejectedValue(error);
      service._isFullscreenActive = true;

      const result = await service._syncFullscreenState();

      expect(mockLogger.error).toHaveBeenCalledWith('Error querying fullscreen state:', error);
      expect(result).toBe(true);
    });
  });

  describe('enterFullscreen', () => {
    it('should do nothing if already fullscreen', () => {
      service._isFullscreenActive = true;

      service.enterFullscreen();

      expect(trpcClient.window.setFullScreen.mutate).not.toHaveBeenCalled();
    });

    it('should request fullscreen when not currently fullscreen', () => {
      service._isFullscreenActive = false;

      service.enterFullscreen();

      expect(trpcClient.window.setFullScreen.mutate).toHaveBeenCalledWith(true);
    });
  });

  describe('exitFullscreen', () => {
    it('should do nothing if not in fullscreen', () => {
      service._isFullscreenActive = false;

      service.exitFullscreen();

      expect(trpcClient.window.setFullScreen.mutate).not.toHaveBeenCalled();
    });

    it('should release fullscreen when currently fullscreen', () => {
      service._isFullscreenActive = true;

      service.exitFullscreen();

      expect(trpcClient.window.setFullScreen.mutate).toHaveBeenCalledWith(false);
    });
  });

  describe('_forceEnterFullscreen', () => {
    it('should request fullscreen via tRPC mutate', () => {
      service._forceEnterFullscreen();

      expect(trpcClient.window.setFullScreen.mutate).toHaveBeenCalledWith(true);
    });

    it('should log when entering fullscreen fails', async () => {
      const error = new Error('Enter failed');
      vi.mocked(trpcClient.window.setFullScreen.mutate).mockRejectedValue(error);

      service._forceEnterFullscreen();

      await vi.waitFor(() => {
        expect(mockLogger.error).toHaveBeenCalledWith('Error entering fullscreen:', error);
      });
    });

    it('should publish an error status message when entering fullscreen fails', async () => {
      const error = new Error('Enter failed');
      vi.mocked(trpcClient.window.setFullScreen.mutate).mockRejectedValue(error);

      service._forceEnterFullscreen();

      await vi.waitFor(() => {
        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.UI.STATUS_MESSAGE,
          { message: 'Could not enter fullscreen', type: 'error' }
        );
      });
    });
  });

  describe('_forceExitFullscreen', () => {
    it('should release fullscreen via tRPC mutate', () => {
      service._forceExitFullscreen();

      expect(trpcClient.window.setFullScreen.mutate).toHaveBeenCalledWith(false);
    });

    it('should log when exiting fullscreen fails', async () => {
      const error = new Error('Exit failed');
      vi.mocked(trpcClient.window.setFullScreen.mutate).mockRejectedValue(error);

      service._forceExitFullscreen();

      await vi.waitFor(() => {
        expect(mockLogger.error).toHaveBeenCalledWith('Error exiting fullscreen:', error);
      });
    });

    it('should publish an error status message when exiting fullscreen fails', async () => {
      const error = new Error('Exit failed');
      vi.mocked(trpcClient.window.setFullScreen.mutate).mockRejectedValue(error);

      service._forceExitFullscreen();

      await vi.waitFor(() => {
        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.UI.STATUS_MESSAGE,
          { message: 'Could not exit fullscreen', type: 'error' }
        );
      });
    });
  });

  describe('_handleFullscreenChange', () => {
    it('should apply fullscreen state when entering fullscreen', () => {
      mockDocument.fullscreenElement = mockDocumentElement;

      service._handleFullscreenChange();

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_STATE,
        { active: true }
      );
    });

    it('should apply fullscreen state when exiting fullscreen', () => {
      mockDocument.fullscreenElement = mockDocumentElement;
      service._handleFullscreenChange();

      mockDocument.fullscreenElement = null;
      service._handleFullscreenChange();

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_STATE,
        { active: false }
      );
    });
  });

  describe('_handleNativeFullscreen', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('should apply fullscreen state when entering native fullscreen', () => {
      emitTrpcData(trpcClient.window.onEnterFullscreen);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_STATE,
        { active: true }
      );
    });

    it('should apply fullscreen state when leaving native fullscreen', () => {
      emitTrpcData(trpcClient.window.onEnterFullscreen);
      emitTrpcData(trpcClient.window.onLeaveFullscreen);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_STATE,
        { active: false }
      );
    });
  });

  describe('_applyFullscreenState', () => {
    it('should publish fullscreen active event when entering fullscreen', () => {
      service._applyFullscreenState(true);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_STATE,
        { active: true }
      );
    });

    it('should publish fullscreen inactive event when exiting fullscreen', () => {
      service._applyFullscreenState(true);
      mockEventBus.publish.mockClear();

      service._applyFullscreenState(false);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_STATE,
        { active: false }
      );
    });

    it('should ignore duplicate state changes (active -> active)', () => {
      service._applyFullscreenState(true);
      mockEventBus.publish.mockClear();

      service._applyFullscreenState(true);

      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });

    it('should ignore duplicate state changes (inactive -> inactive)', () => {
      service._applyFullscreenState(false);

      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });

    it('should update internal state when applying fullscreen', () => {
      expect(service._isFullscreenActive).toBe(false);

      service._applyFullscreenState(true);
      expect(service._isFullscreenActive).toBe(true);

      service._applyFullscreenState(false);
      expect(service._isFullscreenActive).toBe(false);
    });
  });

  describe('integration: fullscreen workflow', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('should handle a complete fullscreen entry and exit cycle', async () => {
      vi.mocked(trpcClient.window.isFullScreen.query).mockResolvedValue({ isFullscreen: false });
      await service.toggleFullscreen();
      expect(trpcClient.window.setFullScreen.mutate).toHaveBeenCalledWith(true);

      mockDocument.fullscreenElement = mockDocumentElement;
      service._handleFullscreenChange();

      expect(service._isFullscreenActive).toBe(true);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_STATE,
        { active: true }
      );

      vi.mocked(trpcClient.window.isFullScreen.query).mockResolvedValue({ isFullscreen: true });
      await service.toggleFullscreen();
      expect(trpcClient.window.setFullScreen.mutate).toHaveBeenCalledWith(false);

      mockDocument.fullscreenElement = null;
      service._handleFullscreenChange();

      expect(service._isFullscreenActive).toBe(false);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_STATE,
        { active: false }
      );
    });

    it('should handle a native fullscreen entry and exit cycle', () => {
      emitTrpcData(trpcClient.window.onEnterFullscreen);

      expect(service._isFullscreenActive).toBe(true);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_STATE,
        { active: true }
      );

      emitTrpcData(trpcClient.window.onLeaveFullscreen);

      expect(service._isFullscreenActive).toBe(false);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_STATE,
        { active: false }
      );
    });
  });

  describe('onResized subscription', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('should publish WINDOW_RESIZED event on resize', () => {
      emitTrpcData(trpcClient.window.onResized);

      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UI.WINDOW_RESIZED);
    });

    it('should sync fullscreen state on resize', async () => {
      vi.mocked(trpcClient.window.isFullScreen.query).mockClear();

      emitTrpcData(trpcClient.window.onResized);

      await vi.waitFor(() => {
        expect(trpcClient.window.isFullScreen.query).toHaveBeenCalled();
      });
    });
  });
});
