/**
 * PresentationModeService Unit Tests
 *
 * The service now owns only the imperative streaming-mode + fullscreen side-effects; the
 * cinematic/minimalist/fullscreen body classes are covered by PresentationModeStore and the
 * BodyClassManager binding tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PresentationModeService } from '@renderer/infrastructure/services/settings/settings-presentation-mode.service';
import { createLoggerFactory, createPresentationModeControllerMock } from '../../../../factories/index.js';

describe('PresentationModeService', () => {
  let service;
  let mockUiController;

  beforeEach(() => {
    mockUiController = createPresentationModeControllerMock();
    service = new PresentationModeService(mockUiController, createLoggerFactory());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('coordinates streaming mode through the controller', () => {
    service.handleStreamingMode(true);
    expect(mockUiController.setStreamingMode).toHaveBeenCalledWith(true);

    service.handleStreamingMode(false);
    expect(mockUiController.setStreamingMode).toHaveBeenCalledWith(false);
  });

  it('updates the fullscreen button and enables controls auto-hide entering fullscreen', () => {
    service.handleFullscreenState(true);
    expect(mockUiController.updateFullscreenButton).toHaveBeenCalledWith(true);
    expect(mockUiController.enableControlsAutoHide).toHaveBeenCalled();
  });

  it('updates the fullscreen button and disables controls auto-hide leaving fullscreen', () => {
    service.handleFullscreenState(false);
    expect(mockUiController.updateFullscreenButton).toHaveBeenCalledWith(false);
    expect(mockUiController.disableControlsAutoHide).toHaveBeenCalled();
  });
});
