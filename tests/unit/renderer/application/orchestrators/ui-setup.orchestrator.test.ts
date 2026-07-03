/**
 * UISetupOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UISetupOrchestrator } from '@renderer/application/orchestrators/ui-setup.orchestrator';
import { createUISetupControllerMock } from '../../../../factories/index.js';
import { createInjectableHarness } from '../../../../support/di/injectable.harness.js';

describe('UISetupOrchestrator', () => {
  let orchestrator;
  let mockUiController;
  let mockEventBus;
  let mockLogger;

  beforeEach(() => {
    const h = createInjectableHarness(UISetupOrchestrator, {
      overrides: {
        uiController: createUISetupControllerMock({
          initializeDeferredComponent: vi.fn(),
          toggleSettingsMenu: vi.fn(),
          toggleShaderSelector: vi.fn(),
          toggleNotesPanel: vi.fn()
        })
      }
    });
    orchestrator = h.subject;
    mockLogger = h.logger;
    ({ uiController: mockUiController, eventBus: mockEventBus } = h.deps);
  });

  describe('constructor', () => {
    it('should create orchestrator with dependencies', () => {
      expect(orchestrator.eventBus).toBe(mockEventBus);
      expect(orchestrator.uiController).toBe(mockUiController);
    });
  });

  describe('initializeDeferredComponents', () => {
    it('should initialize all deferred components', () => {
      orchestrator.initializeDeferredComponents();

      expect(mockUiController.initializeDeferredComponent).toHaveBeenCalledWith('settingsMenuComponent');
      expect(mockUiController.initializeDeferredComponent).toHaveBeenCalledWith('shaderSelectorComponent');
      expect(mockUiController.initializeDeferredComponent).toHaveBeenCalledWith('notesPanelComponent');
    });
  });

  describe('setupUIEventListeners and cleanup', () => {
    it('should set up and clean up event listeners', async () => {
      orchestrator.setupUIEventListeners();
      await orchestrator.cleanup();
      expect(mockLogger.info).toHaveBeenCalledWith('Cleaning up UISetupOrchestrator...');
    });
  });
});
