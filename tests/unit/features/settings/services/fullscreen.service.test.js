/**
 * FullscreenService Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { FullscreenService } from '@renderer/features/settings/services/fullscreen.service.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';
import { CSSClasses } from '@shared/config/css-classes.js';

describe('FullscreenService', () => {
  let service;
  let mockUiController;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;
  let mockWindowAPI;
  let mockDocument;
  let mockDocumentElement;
  let enterFullscreenCallback;
  let leaveFullscreenCallback;

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    mockLoggerFactory = {
      create: vi.fn(() => mockLogger)
    };

    // Mock event bus
    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn()
    };

    // Mock UI controller
    mockUiController = {
      enableControlsAutoHide: vi.fn(),
      disableControlsAutoHide: vi.fn()
    };

    // Mock window.windowAPI
    mockWindowAPI = {
      onEnterFullscreen: vi.fn((callback) => {
        enterFullscreenCallback = callback;
        return vi.fn(); // Returns unsubscribe function
      }),
      onLeaveFullscreen: vi.fn((callback) => {
        leaveFullscreenCallback = callback;
        return vi.fn(); // Returns unsubscribe function
      })
    };

    // Mock document and document.documentElement
    mockDocumentElement = {
      requestFullscreen: vi.fn().mockResolvedValue(undefined)
    };

    mockDocument = {
      fullscreenElement: null,
      documentElement: mockDocumentElement,
      exitFullscreen: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      body: {
        classList: {
          add: vi.fn(),
          remove: vi.fn()
        }
      }
    };

    // Setup global mocks
    global.window = { windowAPI: mockWindowAPI };
    global.document = mockDocument;

    // Create service
    service = new FullscreenService({
      uiController: mockUiController,
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    enterFullscreenCallback = null;
    leaveFullscreenCallback = null;
  });

  describe('constructor', () => {
    it('should create service with required dependencies', () => {
      expect(service.uiController).toBe(mockUiController);
      expect(service.eventBus).toBe(mockEventBus);
      expect(service.logger).toBe(mockLogger);
    });

    it('should initialize internal state', () => {
      expect(service._isFullscreenActive).toBe(false);
      expect(service._boundHandleFullscreenChange).toBeTypeOf('function');
      expect(service._unsubscribeEnterFullscreen).toBeNull();
      expect(service._unsubscribeLeaveFullscreen).toBeNull();
    });

    it('should throw if missing required dependencies', () => {
      expect(() => new FullscreenService({
        uiController: mockUiController,
        loggerFactory: mockLoggerFactory
      })).toThrow(/Missing required dependencies/);
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
      expect(service._unsubscribeEnterFullscreen).toBeTypeOf('function');
      expect(service._unsubscribeLeaveFullscreen).toBeTypeOf('function');
    });

    it('should handle missing windowAPI gracefully', () => {
      global.window.windowAPI = undefined;
      const serviceWithoutAPI = new FullscreenService({
        uiController: mockUiController,
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });

      expect(() => serviceWithoutAPI.initialize()).not.toThrow();
      expect(serviceWithoutAPI._unsubscribeEnterFullscreen).toBeNull();
      expect(serviceWithoutAPI._unsubscribeLeaveFullscreen).toBeNull();
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

    it('should unsubscribe from native fullscreen events', () => {
      const unsubscribeEnter = service._unsubscribeEnterFullscreen;
      const unsubscribeLeave = service._unsubscribeLeaveFullscreen;

      service.dispose();

      expect(unsubscribeEnter).toHaveBeenCalled();
      expect(unsubscribeLeave).toHaveBeenCalled();
      expect(service._unsubscribeEnterFullscreen).toBeNull();
      expect(service._unsubscribeLeaveFullscreen).toBeNull();
    });

    it('should handle dispose when not initialized', () => {
      const uninitializedService = new FullscreenService({
        uiController: mockUiController,
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });

      expect(() => uninitializedService.dispose()).not.toThrow();
    });

    it('should handle dispose without windowAPI', () => {
      global.window.windowAPI = undefined;
      const serviceWithoutAPI = new FullscreenService({
        uiController: mockUiController,
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });

      expect(() => serviceWithoutAPI.dispose()).not.toThrow();
    });
  });

  describe('toggleFullscreen', () => {
    it('should enter fullscreen when not in fullscreen', async () => {
      mockDocument.fullscreenElement = null;

      service.toggleFullscreen();

      expect(mockDocumentElement.requestFullscreen).toHaveBeenCalled();
    });

    it('should exit fullscreen when already in fullscreen', () => {
      mockDocument.fullscreenElement = mockDocumentElement;

      service.toggleFullscreen();

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

      expect(mockDocument.body.classList.add).toHaveBeenCalledWith(CSSClasses.FULLSCREEN_ACTIVE);
      expect(mockUiController.enableControlsAutoHide).toHaveBeenCalled();
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

      expect(mockDocument.body.classList.remove).toHaveBeenCalledWith(CSSClasses.FULLSCREEN_ACTIVE);
      expect(mockUiController.disableControlsAutoHide).toHaveBeenCalled();
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
      enterFullscreenCallback();

      expect(mockDocument.body.classList.add).toHaveBeenCalledWith(CSSClasses.FULLSCREEN_ACTIVE);
      expect(mockUiController.enableControlsAutoHide).toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_STATE,
        { active: true }
      );
    });

    it('should apply fullscreen state when leaving native fullscreen', () => {
      // First enter
      enterFullscreenCallback();

      // Then leave
      leaveFullscreenCallback();

      expect(mockDocument.body.classList.remove).toHaveBeenCalledWith(CSSClasses.FULLSCREEN_ACTIVE);
      expect(mockUiController.disableControlsAutoHide).toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_STATE,
        { active: false }
      );
    });
  });

  describe('_applyFullscreenState', () => {
    it('should add CSS class when entering fullscreen', () => {
      service._applyFullscreenState(true);

      expect(mockDocument.body.classList.add).toHaveBeenCalledWith(CSSClasses.FULLSCREEN_ACTIVE);
    });

    it('should remove CSS class when exiting fullscreen', () => {
      // First enter
      service._applyFullscreenState(true);

      // Then exit
      service._applyFullscreenState(false);

      expect(mockDocument.body.classList.remove).toHaveBeenCalledWith(CSSClasses.FULLSCREEN_ACTIVE);
    });

    it('should enable controls auto-hide when entering fullscreen', () => {
      service._applyFullscreenState(true);

      expect(mockUiController.enableControlsAutoHide).toHaveBeenCalled();
    });

    it('should disable controls auto-hide when exiting fullscreen', () => {
      // First enter
      service._applyFullscreenState(true);

      // Then exit
      service._applyFullscreenState(false);

      expect(mockUiController.disableControlsAutoHide).toHaveBeenCalled();
    });

    it('should publish fullscreen active event', () => {
      service._applyFullscreenState(true);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_STATE,
        { active: true }
      );
    });

    it('should publish fullscreen inactive event', () => {
      // First enter
      service._applyFullscreenState(true);

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
      mockDocument.body.classList.add.mockClear();
      mockUiController.enableControlsAutoHide.mockClear();
      mockEventBus.publish.mockClear();

      // Apply same state again
      service._applyFullscreenState(true);

      expect(mockDocument.body.classList.add).not.toHaveBeenCalled();
      expect(mockUiController.enableControlsAutoHide).not.toHaveBeenCalled();
      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });

    it('should ignore duplicate state changes (inactive -> inactive)', () => {
      // Service starts inactive, so apply inactive again
      service._applyFullscreenState(false);

      expect(mockDocument.body.classList.remove).not.toHaveBeenCalled();
      expect(mockUiController.disableControlsAutoHide).not.toHaveBeenCalled();
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

    it('should handle complete fullscreen entry and exit cycle', () => {
      // Enter fullscreen
      mockDocument.fullscreenElement = null;
      service.toggleFullscreen();
      expect(mockDocumentElement.requestFullscreen).toHaveBeenCalled();

      // Simulate fullscreenchange event
      mockDocument.fullscreenElement = mockDocumentElement;
      service._handleFullscreenChange();

      expect(service._isFullscreenActive).toBe(true);
      expect(mockDocument.body.classList.add).toHaveBeenCalledWith(CSSClasses.FULLSCREEN_ACTIVE);
      expect(mockUiController.enableControlsAutoHide).toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_STATE,
        { active: true }
      );

      // Exit fullscreen
      service.toggleFullscreen();
      expect(mockDocument.exitFullscreen).toHaveBeenCalled();

      // Simulate fullscreenchange event
      mockDocument.fullscreenElement = null;
      service._handleFullscreenChange();

      expect(service._isFullscreenActive).toBe(false);
      expect(mockDocument.body.classList.remove).toHaveBeenCalledWith(CSSClasses.FULLSCREEN_ACTIVE);
      expect(mockUiController.disableControlsAutoHide).toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_STATE,
        { active: false }
      );
    });

    it('should handle native fullscreen entry and exit cycle', () => {
      // Enter native fullscreen
      enterFullscreenCallback();

      expect(service._isFullscreenActive).toBe(true);
      expect(mockDocument.body.classList.add).toHaveBeenCalledWith(CSSClasses.FULLSCREEN_ACTIVE);
      expect(mockUiController.enableControlsAutoHide).toHaveBeenCalled();

      // Leave native fullscreen
      leaveFullscreenCallback();

      expect(service._isFullscreenActive).toBe(false);
      expect(mockDocument.body.classList.remove).toHaveBeenCalledWith(CSSClasses.FULLSCREEN_ACTIVE);
      expect(mockUiController.disableControlsAutoHide).toHaveBeenCalled();
    });
  });
});
