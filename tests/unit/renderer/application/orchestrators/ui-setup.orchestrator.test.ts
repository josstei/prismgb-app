import * as serviceMocks from '../../../../factories/index.js';
/**
 * UISetupOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UISetupOrchestrator } from '@renderer/application/orchestrators/ui-setup.orchestrator';
import { createUISetupControllerMock } from '../../../../factories/index.js';
import { createServiceHarness } from '../../../../support/service.harness.js';
import { EventChannels, PlatformEventBus } from '@platform/events';

describe('UISetupOrchestrator', () => {
  let orchestrator;
  let mockUiController;
  let mockEventBus;
  let mockLogger;

  beforeEach(() => {
    const h = createServiceHarness(UISetupOrchestrator, {
      appState: serviceMocks.createAppState(),
      eventBus: serviceMocks.createEventBus(),
      loggerFactory: serviceMocks.createLoggerFactory(),
      uiController: { ...createUISetupControllerMock(),
          initializeDeferredComponents: vi.fn(),
          toggleSettingsMenu: vi.fn(),
          toggleShaderSelector: vi.fn(),
          toggleNotesPanel: vi.fn()
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

      expect(mockUiController.initializeDeferredComponents).toHaveBeenCalledOnce();
    });
  });

  describe('setupUIEventListeners and cleanup', () => {
    it('should set up and clean up event listeners', async () => {
      orchestrator.setupUIEventListeners();
      await orchestrator.cleanup();
      expect(mockLogger.info).toHaveBeenCalledWith('Cleaning up UISetupOrchestrator...');
    });
  });

  it('projects device events to UI feedback and unsubscribes during disposal', async () => {
    const bus = new PlatformEventBus();
    const publish = vi.spyOn(bus, 'publish');
    const ui = new UISetupOrchestrator({
      appState: serviceMocks.createAppState(), uiController: mockUiController,
      eventBus: bus, loggerFactory: serviceMocks.createLoggerFactory()
    });
    await ui.initialize();
    const status = { state: 'connected' as const, connected: true, device: null };
    bus.publish(EventChannels.DEVICE.STATUS_CHANGED, status);
    expect(publish).toHaveBeenCalledWith(EventChannels.UI.DEVICE_STATUS, { status });
    expect(publish).toHaveBeenCalledWith(EventChannels.UI.STATUS_MESSAGE, { message: 'Device ready' });
    bus.publish(EventChannels.DEVICE.STATUS_CHANGED, { state: 'disconnected', connected: false, device: null });
    expect(publish).toHaveBeenCalledWith(EventChannels.UI.OVERLAY_VISIBLE, { visible: true });
    expect(publish).toHaveBeenCalledWith(EventChannels.UI.STATUS_MESSAGE, { message: 'Device disconnected', type: 'warning' });
    bus.publish(EventChannels.DEVICE.ENUMERATION_FAILED, { reason: 'webcam_access', error: 'denied' });
    expect(publish).toHaveBeenCalledWith(EventChannels.UI.STATUS_MESSAGE, {
      message: 'Camera access denied. Please allow camera permissions.', type: 'warning'
    });
    await ui.dispose();
    expect(bus.emitter.eventNames()).toEqual([]);
  });
});
