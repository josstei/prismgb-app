/**
 * PresentationModeService Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PresentationModeService } from '@renderer/infrastructure/services/settings/presentation-mode.service.ts';

describe('PresentationModeService', () => {
  let service;
  let mockUiController;
  let mockUiEffects;
  let mockAppState;
  let mockLoggerFactory;

  beforeEach(() => {
    mockUiController = {
      setStreamingMode: vi.fn(),
      updateFullscreenButton: vi.fn(),
      getFullscreenControls: vi.fn(() => ({ classList: { add: vi.fn(), remove: vi.fn() } }))
    };

    mockUiEffects = {
      setCinematicMode: vi.fn(),
      setMinimalistFullscreen: vi.fn(),
      setFullscreenMode: vi.fn(),
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
      uiEffects: mockUiEffects,
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
    expect(mockUiEffects.setCinematicMode).toHaveBeenCalledWith(true);

    service.handleStreamingMode(false);

    expect(mockUiController.setStreamingMode).toHaveBeenCalledWith(false);
    expect(mockUiEffects.setCinematicMode).toHaveBeenCalledWith(false);
  });

  it('updates fullscreen UI and controls auto-hide state', () => {
    service.handleFullscreenState(true);

    expect(mockUiController.updateFullscreenButton).toHaveBeenCalledWith(true);
    expect(mockUiEffects.setFullscreenMode).toHaveBeenCalledWith(true);
    expect(mockUiEffects.enableControlsAutoHide).toHaveBeenCalled();

    service.handleFullscreenState(false);

    expect(mockUiController.updateFullscreenButton).toHaveBeenCalledWith(false);
    expect(mockUiEffects.setFullscreenMode).toHaveBeenCalledWith(false);
    expect(mockUiEffects.disableControlsAutoHide).toHaveBeenCalled();
  });

  it('applies minimalist fullscreen only when all conditions are met', () => {
    service.handleStreamingMode(true);
    service.handleFullscreenState(true);
    mockUiEffects.setMinimalistFullscreen.mockClear();

    service.handleMinimalistFullscreenChanged(true);

    expect(mockUiEffects.setMinimalistFullscreen).toHaveBeenCalledWith(true);
  });

  it('removes minimalist fullscreen when any condition becomes false', () => {
    service.handleStreamingMode(true);
    service.handleFullscreenState(true);
    service.handleMinimalistFullscreenChanged(true);

    mockUiEffects.setMinimalistFullscreen.mockClear();

    service.handleFullscreenState(false);

    expect(mockUiEffects.setMinimalistFullscreen).toHaveBeenCalledWith(false);
  });

  it('respects cinematic mode toggles while streaming', () => {
    service.handleStreamingMode(true);
    mockUiEffects.setCinematicMode.mockClear();

    service.handleCinematicModeChanged(false);

    expect(mockUiEffects.setCinematicMode).toHaveBeenCalledWith(false);
  });
});
