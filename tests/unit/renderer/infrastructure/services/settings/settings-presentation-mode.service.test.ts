/**
 * PresentationModeService Unit Tests
 *
 * The service now owns only the imperative streaming-mode + fullscreen side-effects; the
 * cinematic/minimalist/fullscreen body classes are covered by PresentationModeStore and the
 * BodyClassManager binding tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PresentationModeService } from '@renderer/infrastructure/services/settings/settings-presentation-mode.service';
import {
  createDomBindingsMock,
  createStreamControlsComponentMock,
  createUIEffectsMock,
  createUiComponentHostMock
} from '../../../../../factories/index.js';
import { createInjectableHarness } from '../../../../../support/di/injectable.harness.js';

describe('PresentationModeService', () => {
  let service;
  let mockUiComponentHost;
  let mockUiEffects;
  let mockDomBindings;
  let mockStreamControlsComponent;
  let mockShaderSelectorComponent;

  beforeEach(() => {
    mockStreamControlsComponent = createStreamControlsComponentMock();
    mockShaderSelectorComponent = { hide: vi.fn() };

    const h = createInjectableHarness(PresentationModeService, {
      overrides: {
        uiComponentHost: createUiComponentHostMock({
          streamControlsComponent: mockStreamControlsComponent,
          shaderSelectorComponent: mockShaderSelectorComponent
        }),
        uiEffects: createUIEffectsMock(),
        domBindings: createDomBindingsMock()
      }
    });
    service = h.subject;
    ({
      uiComponentHost: mockUiComponentHost,
      uiEffects: mockUiEffects,
      domBindings: mockDomBindings
    } = h.deps);
  });

  it('coordinates streaming mode through stream controls and effects', () => {
    service.handleStreamingMode(true);
    expect(mockStreamControlsComponent.setStreamingMode).toHaveBeenCalledWith(true);
    expect(mockUiEffects.enableToolbarAutoHide).toHaveBeenCalledWith(mockDomBindings.flat.streamToolbar);
    expect(mockUiEffects.enableCursorAutoHide).toHaveBeenCalled();

    service.handleStreamingMode(false);
    expect(mockStreamControlsComponent.setStreamingMode).toHaveBeenCalledWith(false);
    expect(mockUiEffects.disableCursorAutoHide).toHaveBeenCalled();
    expect(mockUiEffects.disableToolbarAutoHide).toHaveBeenCalled();
    expect(mockShaderSelectorComponent.hide).toHaveBeenCalled();
  });

  it('updates the fullscreen button and enables controls auto-hide entering fullscreen', () => {
    service.handleFullscreenState(true);
    expect(mockDomBindings.flat.fullscreenBtn.title).toBe('Exit Fullscreen');
    expect(mockUiEffects.enableControlsAutoHide).toHaveBeenCalledWith(mockDomBindings.flat.fullscreenControls);
  });

  it('updates the fullscreen button and disables controls auto-hide leaving fullscreen', () => {
    service.handleFullscreenState(false);
    expect(mockDomBindings.flat.fullscreenBtn.title).toBe('Fullscreen');
    expect(mockUiEffects.disableControlsAutoHide).toHaveBeenCalled();
  });
});
