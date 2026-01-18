/**
 * PresentationModeService Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PresentationModeService } from '@renderer/features/settings/services/presentation-mode.service.js';

describe('PresentationModeService', () => {
  let service;
  let mockUiController;
  let mockAppState;
  let mockLoggerFactory;

  beforeEach(() => {
    mockUiController = {
      setStreamingMode: vi.fn(),
      updateCinematicMode: vi.fn(),
      updateMinimalistFullscreen: vi.fn(),
      updateFullscreenButton: vi.fn(),
      updateFullscreenMode: vi.fn(),
      enableControlsAutoHide: vi.fn(),
      disableControlsAutoHide: vi.fn()
    };

    mockAppState = {
      isCinematicModeEnabled: true,
      isStreaming: false
    };

    mockLoggerFactory = {
      create: vi.fn(() => ({
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      }))
    };

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      writable: true,
      value: null
    });

    service = new PresentationModeService({
      uiController: mockUiController,
      appState: mockAppState,
      loggerFactory: mockLoggerFactory
    });
  });

  afterEach(() => {
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
