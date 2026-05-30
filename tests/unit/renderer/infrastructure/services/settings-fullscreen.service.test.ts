// @ts-nocheck
/**
 * SettingsFullscreenService Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SettingsFullscreenService } from '@renderer/infrastructure/services/settings/settings-fullscreen.service';
import { EventChannels } from '@prismgb/events';
import {
  clearPreloadApi,
  createPreloadApiMock,
  setPreloadApi
} from '../../../../support/mocks/preload-api-globals.js';
import { installFullscreenDocumentMock } from '../../../../support/mocks/browser-api.installers.js';
import { createEventBus, createLoggerFactory } from '../../../../factories/index.js';

describe('SettingsFullscreenService', () => {
  let service;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;
  let mockWindowAPI;
  let mockDocument;
  let mockDocumentElement;
  let documentMock;

  beforeEach(() => {
    mockEventBus = createEventBus();
    mockLoggerFactory = createLoggerFactory();

    mockWindowAPI = createPreloadApiMock('windowAPI', { setFullScreen: undefined, isFullScreen: undefined });

    documentMock = installFullscreenDocumentMock();
    mockDocument = documentMock.document;
    mockDocumentElement = documentMock.documentElement;

    setPreloadApi('windowAPI', mockWindowAPI);

    service = new SettingsFullscreenService({
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory
    });
    mockLogger = mockLoggerFactory._getLogger('SettingsFullscreenService');
  });

  afterEach(() => {
    documentMock?.cleanup();
    vi.restoreAllMocks();
    clearPreloadApi('windowAPI');
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

    it('should subscribe to native fullscreen events if windowAPI exists', () => {
      service.initialize();

      expect(mockWindowAPI.onEnterFullscreen).toHaveBeenCalled();
      expect(mockWindowAPI.onLeaveFullscreen).toHaveBeenCalled();
      expect(mockWindowAPI.onResized).toHaveBeenCalled();
    });

    it('should handle missing windowAPI gracefully', () => {
      clearPreloadApi('windowAPI');
      const serviceWithoutAPI = new SettingsFullscreenService({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });

      expect(() => serviceWithoutAPI.initialize()).not.toThrow();
    });
  });

  describe('dispose', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('should remove fullscreenchange event listener', () => {
      service.dispose();

      expect(mockDocument.removeEventListener).toHaveBeenCalledWith(
        'fullscreenchange',
        service._boundHandleFullscreenChange
      );
    });

    it('should dispose bridge-owned native fullscreen subscriptions', () => {
      const [unsubscribeEnterFullscreen] = mockWindowAPI.onEnterFullscreen.getUnsubscribers();
      const [unsubscribeLeaveFullscreen] = mockWindowAPI.onLeaveFullscreen.getUnsubscribers();
      const [unsubscribeResized] = mockWindowAPI.onResized.getUnsubscribers();
      service.dispose();

      expect(unsubscribeEnterFullscreen).toHaveBeenCalled();
      expect(unsubscribeLeaveFullscreen).toHaveBeenCalled();
      expect(unsubscribeResized).toHaveBeenCalled();
    });

    it('should handle dispose when not initialized', () => {
      const uninitializedService = new SettingsFullscreenService({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });

      expect(() => uninitializedService.dispose()).not.toThrow();
    });

    it('should handle dispose without windowAPI', () => {
      clearPreloadApi('windowAPI');
      const serviceWithoutAPI = new SettingsFullscreenService({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });

      expect(() => serviceWithoutAPI.dispose()).not.toThrow();
    });
  });

  describe('toggleFullscreen', () => {
    it('should enter fullscreen when not in fullscreen', async () => {
      await service.toggleFullscreen();

      expect(mockDocumentElement.requestFullscreen).toHaveBeenCalled();
    });

    it('should exit fullscreen when already in fullscreen', async () => {
      service._isFullscreenActive = true;
      mockDocument.fullscreenElement = mockDocumentElement;

      await service.toggleFullscreen();

      expect(mockDocument.exitFullscreen).toHaveBeenCalled();
    });

    it('should handle requestFullscreen errors', async () => {
      const error = new Error('Fullscreen not allowed');
      mockDocumentElement.requestFullscreen.mockRejectedValue(error);
      mockDocument.fullscreenElement = null;

      service.toggleFullscreen();

      // Wait for promise to reject
      await vi.waitFor(() => {
        expect(mockLogger.error).toHaveBeenCalledWith('Error entering fullscreen:', error);
      });
    });

    it('should publish error message when requestFullscreen fails', async () => {
      const error = new Error('Fullscreen not allowed');
      mockDocumentElement.requestFullscreen.mockRejectedValue(error);
      mockDocument.fullscreenElement = null;

      service.toggleFullscreen();

      await vi.waitFor(() => {
        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.UI.STATUS_MESSAGE,
          { message: 'Could not enter fullscreen', type: 'error' }
        );
      });
    });

    it('should set fullscreen inactive state on error', async () => {
      const error = new Error('Fullscreen not allowed');
      mockDocumentElement.requestFullscreen.mockRejectedValue(error);
      mockDocument.fullscreenElement = null;

      service.toggleFullscreen();

      await vi.waitFor(() => {
        expect(service._isFullscreenActive).toBe(false);
      });
    });

    it('should publish fullscreen inactive event on error', async () => {
      const error = new Error('Fullscreen not allowed');
      mockDocumentElement.requestFullscreen.mockRejectedValue(error);
      mockDocument.fullscreenElement = null;

      service.toggleFullscreen();

      await vi.waitFor(() => {
        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.UI.FULLSCREEN_STATE,
          { active: false }
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
      // First enter fullscreen
      mockDocument.fullscreenElement = mockDocumentElement;
      service._handleFullscreenChange();

      // Then exit fullscreen
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
      mockWindowAPI.onEnterFullscreen.emit();

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_STATE,
        { active: true }
      );
    });

    it('should apply fullscreen state when leaving native fullscreen', () => {
      // First enter
      mockWindowAPI.onEnterFullscreen.emit();

      // Then leave
      mockWindowAPI.onLeaveFullscreen.emit();

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
      // First enter
      service._applyFullscreenState(true);
      mockEventBus.publish.mockClear();

      // Then exit
      service._applyFullscreenState(false);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_STATE,
        { active: false }
      );
    });

    it('should ignore duplicate state changes (active -> active)', () => {
      service._applyFullscreenState(true);

      // Reset mocks
      mockEventBus.publish.mockClear();

      // Apply same state again
      service._applyFullscreenState(true);

      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });

    it('should ignore duplicate state changes (inactive -> inactive)', () => {
      // Service starts inactive, so apply inactive again
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

    it('should handle complete fullscreen entry and exit cycle', async () => {
      // Enter fullscreen
      mockDocument.fullscreenElement = null;
      await service.toggleFullscreen();
      expect(mockDocumentElement.requestFullscreen).toHaveBeenCalled();

      // Simulate fullscreenchange event
      mockDocument.fullscreenElement = mockDocumentElement;
      service._handleFullscreenChange();

      expect(service._isFullscreenActive).toBe(true);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_STATE,
        { active: true }
      );

      // Exit fullscreen
      await service.toggleFullscreen();
      expect(mockDocument.exitFullscreen).toHaveBeenCalled();

      // Simulate fullscreenchange event
      mockDocument.fullscreenElement = null;
      service._handleFullscreenChange();

      expect(service._isFullscreenActive).toBe(false);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_STATE,
        { active: false }
      );
    });

    it('should handle native fullscreen entry and exit cycle', () => {
      // Enter native fullscreen
      mockWindowAPI.onEnterFullscreen.emit();

      expect(service._isFullscreenActive).toBe(true);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_STATE,
        { active: true }
      );

      // Leave native fullscreen
      mockWindowAPI.onLeaveFullscreen.emit();

      expect(service._isFullscreenActive).toBe(false);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_STATE,
        { active: false }
      );
    });
  });

  describe('enterFullscreen', () => {
    it('should do nothing if already fullscreen', () => {
      service._isFullscreenActive = true;

      service.enterFullscreen();

      expect(mockDocumentElement.requestFullscreen).not.toHaveBeenCalled();
    });

    it('should call _forceEnterFullscreen when not in fullscreen', () => {
      service._isFullscreenActive = false;

      service.enterFullscreen();

      expect(mockDocumentElement.requestFullscreen).toHaveBeenCalled();
    });
  });

  describe('exitFullscreen', () => {
    it('should do nothing if not in fullscreen', () => {
      service._isFullscreenActive = false;

      service.exitFullscreen();

      expect(mockDocument.exitFullscreen).not.toHaveBeenCalled();
    });

    it('should call _forceExitFullscreen when in fullscreen', () => {
      service._isFullscreenActive = true;
      mockDocument.fullscreenElement = mockDocumentElement;

      service.exitFullscreen();

      expect(mockDocument.exitFullscreen).toHaveBeenCalled();
    });
  });

  describe('_syncFullscreenState', () => {
    it('should use windowAPI.isFullScreen when available', async () => {
      mockWindowAPI.isFullScreen = vi.fn().mockResolvedValue({ success: true, isFullscreen: true });

      const result = await service._syncFullscreenState();

      expect(mockWindowAPI.isFullScreen).toHaveBeenCalled();
      expect(result).toBe(true);
      expect(service._isFullscreenActive).toBe(true);
    });

    it('should handle isFullScreen error and return current state', async () => {
      const error = new Error('Query failed');
      mockWindowAPI.isFullScreen = vi.fn().mockRejectedValue(error);
      service._isFullscreenActive = true;

      const result = await service._syncFullscreenState();

      expect(mockLogger.error).toHaveBeenCalledWith('Error querying fullscreen state:', error);
      expect(result).toBe(true);
    });

    it('should use document.fullscreenElement when windowAPI.isFullScreen unavailable', async () => {
      delete mockWindowAPI.isFullScreen;
      mockDocument.fullscreenElement = mockDocumentElement;

      const result = await service._syncFullscreenState();

      expect(result).toBe(true);
    });
  });

  describe('_forceEnterFullscreen with windowAPI', () => {
    it('should use windowAPI.setFullScreen when available', () => {
      mockWindowAPI.setFullScreen = vi.fn().mockResolvedValue(undefined);

      service._forceEnterFullscreen();

      expect(mockWindowAPI.setFullScreen).toHaveBeenCalledWith(true);
      expect(mockDocumentElement.requestFullscreen).not.toHaveBeenCalled();
    });

    it('should handle windowAPI.setFullScreen error', async () => {
      const error = new Error('Enter failed');
      mockWindowAPI.setFullScreen = vi.fn().mockRejectedValue(error);

      service._forceEnterFullscreen();

      await vi.waitFor(() => {
        expect(mockLogger.error).toHaveBeenCalledWith('Error entering fullscreen:', error);
      });
    });

    it('should publish error message when windowAPI.setFullScreen fails', async () => {
      const error = new Error('Enter failed');
      mockWindowAPI.setFullScreen = vi.fn().mockRejectedValue(error);

      service._forceEnterFullscreen();

      await vi.waitFor(() => {
        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.UI.STATUS_MESSAGE,
          { message: 'Could not enter fullscreen', type: 'error' }
        );
      });
    });
  });

  describe('_forceExitFullscreen with windowAPI', () => {
    it('should use windowAPI.setFullScreen when available', () => {
      mockWindowAPI.setFullScreen = vi.fn().mockResolvedValue(undefined);

      service._forceExitFullscreen();

      expect(mockWindowAPI.setFullScreen).toHaveBeenCalledWith(false);
      expect(mockDocument.exitFullscreen).not.toHaveBeenCalled();
    });

    it('should handle windowAPI.setFullScreen error on exit', async () => {
      const error = new Error('Exit failed');
      mockWindowAPI.setFullScreen = vi.fn().mockRejectedValue(error);

      service._forceExitFullscreen();

      await vi.waitFor(() => {
        expect(mockLogger.error).toHaveBeenCalledWith('Error exiting fullscreen:', error);
      });
    });

    it('should publish error message when windowAPI.setFullScreen fails on exit', async () => {
      const error = new Error('Exit failed');
      mockWindowAPI.setFullScreen = vi.fn().mockRejectedValue(error);

      service._forceExitFullscreen();

      await vi.waitFor(() => {
        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.UI.STATUS_MESSAGE,
          { message: 'Could not exit fullscreen', type: 'error' }
        );
      });
    });

    it('should not call document.exitFullscreen when no fullscreenElement', () => {
      delete mockWindowAPI.setFullScreen;
      mockDocument.fullscreenElement = null;

      service._forceExitFullscreen();

      expect(mockDocument.exitFullscreen).not.toHaveBeenCalled();
    });
  });

  describe('onResized callback', () => {
    beforeEach(() => {
      mockWindowAPI.isFullScreen = vi.fn().mockResolvedValue({ success: true, isFullscreen: false });

      service = new SettingsFullscreenService({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });
      service.initialize();
    });

    it('should publish WINDOW_RESIZED event on resize', async () => {
      mockWindowAPI.onResized.emit();

      await vi.waitFor(() => {
        expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UI.WINDOW_RESIZED);
      });
    });

    it('should sync fullscreen state on resize', async () => {
      mockWindowAPI.onResized.emit();

      await vi.waitFor(() => {
        expect(mockWindowAPI.isFullScreen).toHaveBeenCalled();
      });
    });
  });
});
