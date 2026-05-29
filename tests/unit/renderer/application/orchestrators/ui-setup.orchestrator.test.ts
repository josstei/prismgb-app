// @ts-nocheck
/**
 * UISetupOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { UISetupOrchestrator } from '@renderer/application/orchestrators/ui-setup.orchestrator.ts';
import {
  createAppState,
  createEventBus,
  createLoggerFactory,
  createNotesServiceMock,
  createOrchestratorMock,
  createSettingsServiceMock,
  createUISetupControllerMock
} from '../../../../factories/index.js';

describe('UISetupOrchestrator', () => {
  let orchestrator;
  let mockAppState;
  let mockUpdateOrchestrator;
  let mockSettingsService;
  let mockNotesService;
  let mockUiController;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;

  beforeEach(() => {
    mockLoggerFactory = createLoggerFactory();
    mockEventBus = createEventBus();
    mockAppState = createAppState();
    mockUpdateOrchestrator = createOrchestratorMock();
    mockSettingsService = createSettingsServiceMock();
    mockNotesService = createNotesServiceMock();

    mockUiController = createUISetupControllerMock({
      initializeDeferredComponent: vi.fn(),
      toggleSettingsMenu: vi.fn(),
      toggleShaderSelector: vi.fn(),
      toggleNotesPanel: vi.fn()
    });

    orchestrator = new UISetupOrchestrator({
      appState: mockAppState,
      updateOrchestrator: mockUpdateOrchestrator,
      settingsService: mockSettingsService,
      notesService: mockNotesService,
      uiController: mockUiController,
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory
    });
    mockLogger = mockLoggerFactory._getLogger('UISetupOrchestrator');
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

      expect(mockUiController.initializeDeferredComponent).toHaveBeenCalledWith(
        'settingsMenuComponent',
        expect.any(Object)
      );
      expect(mockUiController.initializeDeferredComponent).toHaveBeenCalledWith(
        'shaderSelectorComponent',
        expect.any(Object)
      );
      expect(mockUiController.initializeDeferredComponent).toHaveBeenCalledWith(
        'notesPanelComponent',
        expect.any(Object)
      );
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
