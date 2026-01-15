/**
 * PresentationModeCoordinator Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PresentationModeCoordinator } from '@renderer/ui/orchestration/presentation-mode.coordinator.js';

describe('PresentationModeCoordinator', () => {
  let coordinator;
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
      cinematicModeEnabled: true,
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

    coordinator = new PresentationModeCoordinator({
      uiController: mockUiController,
      appState: mockAppState,
      loggerFactory: mockLoggerFactory
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enables cinematic visuals only when streaming is active', () => {
    coordinator.handleStreamingMode(true);

    expect(mockUiController.setStreamingMode).toHaveBeenCalledWith(true);
    expect(mockUiController.updateCinematicMode).toHaveBeenCalledWith(true);

    coordinator.handleStreamingMode(false);

    expect(mockUiController.setStreamingMode).toHaveBeenCalledWith(false);
    expect(mockUiController.updateCinematicMode).toHaveBeenCalledWith(false);
  });

  it('updates fullscreen UI and controls auto-hide state', () => {
    coordinator.handleFullscreenState(true);

    expect(mockUiController.updateFullscreenButton).toHaveBeenCalledWith(true);
    expect(mockUiController.updateFullscreenMode).toHaveBeenCalledWith(true);
    expect(mockUiController.enableControlsAutoHide).toHaveBeenCalled();

    coordinator.handleFullscreenState(false);

    expect(mockUiController.updateFullscreenButton).toHaveBeenCalledWith(false);
    expect(mockUiController.updateFullscreenMode).toHaveBeenCalledWith(false);
    expect(mockUiController.disableControlsAutoHide).toHaveBeenCalled();
  });

  it('applies minimalist fullscreen only when all conditions are met', () => {
    coordinator.handleStreamingMode(true);
    coordinator.handleFullscreenState(true);
    mockUiController.updateMinimalistFullscreen.mockClear();

    coordinator.handleMinimalistFullscreenChanged(true);

    expect(mockUiController.updateMinimalistFullscreen).toHaveBeenCalledWith(true);
  });

  it('removes minimalist fullscreen when any condition becomes false', () => {
    coordinator.handleStreamingMode(true);
    coordinator.handleFullscreenState(true);
    coordinator.handleMinimalistFullscreenChanged(true);

    mockUiController.updateMinimalistFullscreen.mockClear();

    coordinator.handleFullscreenState(false);

    expect(mockUiController.updateMinimalistFullscreen).toHaveBeenCalledWith(false);
  });

  it('respects cinematic mode toggles while streaming', () => {
    coordinator.handleStreamingMode(true);
    mockUiController.updateCinematicMode.mockClear();

    coordinator.handleCinematicModeChanged(false);

    expect(mockUiController.updateCinematicMode).toHaveBeenCalledWith(false);
  });
});
