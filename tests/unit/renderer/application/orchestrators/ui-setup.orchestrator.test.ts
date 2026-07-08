/**
 * UISetupOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UISetupOrchestrator } from '@renderer/application/orchestrators/ui-setup.orchestrator';
import { createUiComponentHostMock } from '../../../../factories/index.js';
import { createInjectableHarness } from '../../../../support/di/injectable.harness.js';

describe('UISetupOrchestrator', () => {
  let orchestrator;
  let mockUiComponentHost;
  let mockEventBus;
  let mockLogger;

  beforeEach(() => {
    const h = createInjectableHarness(UISetupOrchestrator, {
      overrides: {
        uiComponentHost: createUiComponentHostMock({
          settingsMenuComponent: { toggle: vi.fn() },
          shaderSelectorComponent: { toggle: vi.fn() },
          notesPanelComponent: { toggle: vi.fn() }
        })
      }
    });
    orchestrator = h.subject;
    mockLogger = h.logger;
    ({ uiComponentHost: mockUiComponentHost, eventBus: mockEventBus } = h.deps);
  });

  describe('constructor', () => {
    it('should create orchestrator with dependencies', () => {
      expect(orchestrator.eventBus).toBe(mockEventBus);
      expect(orchestrator.uiComponentHost).toBe(mockUiComponentHost);
    });
  });

  describe('initializeDeferredComponents', () => {
    it('should initialize all deferred components', () => {
      orchestrator.initializeDeferredComponents();

      expect(mockUiComponentHost.get).toHaveBeenCalledWith('settingsMenuComponent');
      expect(mockUiComponentHost.get).toHaveBeenCalledWith('shaderSelectorComponent');
      expect(mockUiComponentHost.get).toHaveBeenCalledWith('notesPanelComponent');
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
