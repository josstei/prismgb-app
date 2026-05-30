/**
 * PresentationModeService Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PresentationModeService } from '@renderer/infrastructure/services/settings-presentation-mode.service';
import {
  createAppState,
  createLoggerFactory,
  createPresentationModeControllerMock,
} from '../../../../factories/index.js';
import { installDocumentPropertyMock } from '../../../../support/mocks/browser-api.installers.js';

describe('PresentationModeService', () => {
  let service;
  let mockUiController;
  let mockAppState;
  let mockLoggerFactory;
  let fullscreenElementMock;

  beforeEach(() => {
    mockUiController = createPresentationModeControllerMock();

    mockAppState = createAppState({
      initialState: {
        isCinematicModeEnabled: true,
        isStreaming: false
      }
    });
    mockLoggerFactory = createLoggerFactory();

    fullscreenElementMock = installDocumentPropertyMock('fullscreenElement', null);

    service = new PresentationModeService({
      uiController: mockUiController,
      appState: mockAppState,
      loggerFactory: mockLoggerFactory
    });
  });

  afterEach(() => {
    fullscreenElementMock.cleanup();
    vi.restoreAllMocks();
  });

  it('enables cinematic visuals only when streaming is active', () => {
    service.handleStreamingMode(true);

    expect(mockUiController.setStreamingMode).toHaveBeenCalledWith(true);
    expect(mockUiController.updateCinematicMode).toHaveBeenCalledWith(true);

    service.handleStreamingMode(false);

    expect(mockUiController.setStreamingMode).toHaveBeenCalledWith(false);
    expect(mockUiController.updateCinematicMode).toHaveBeenCalledWith(false);
  });

  it('updates fullscreen UI and controls auto-hide state', () => {
    service.handleFullscreenState(true);

    expect(mockUiController.updateFullscreenButton).toHaveBeenCalledWith(true);
    expect(mockUiController.updateFullscreenMode).toHaveBeenCalledWith(true);
    expect(mockUiController.enableControlsAutoHide).toHaveBeenCalled();

    service.handleFullscreenState(false);

    expect(mockUiController.updateFullscreenButton).toHaveBeenCalledWith(false);
    expect(mockUiController.updateFullscreenMode).toHaveBeenCalledWith(false);
    expect(mockUiController.disableControlsAutoHide).toHaveBeenCalled();
  });

  it('applies minimalist fullscreen only when all conditions are met', () => {
    service.handleStreamingMode(true);
    service.handleFullscreenState(true);
    mockUiController.updateMinimalistFullscreen.mockClear();

    service.handleMinimalistFullscreenChanged(true);

    expect(mockUiController.updateMinimalistFullscreen).toHaveBeenCalledWith(true);
  });

  it('removes minimalist fullscreen when any condition becomes false', () => {
    service.handleStreamingMode(true);
    service.handleFullscreenState(true);
    service.handleMinimalistFullscreenChanged(true);

    mockUiController.updateMinimalistFullscreen.mockClear();

    service.handleFullscreenState(false);

    expect(mockUiController.updateMinimalistFullscreen).toHaveBeenCalledWith(false);
  });

  it('respects cinematic mode toggles while streaming', () => {
    service.handleStreamingMode(true);
    mockUiController.updateCinematicMode.mockClear();

    service.handleCinematicModeChanged(false);

    expect(mockUiController.updateCinematicMode).toHaveBeenCalledWith(false);
  });
});
