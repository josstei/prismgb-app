/**
 * UpdateSectionComponent Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UpdateSectionComponent } from '@renderer/features/updates/ui/update-section.component.js';
import { UpdateState } from '@renderer/features/updates/services/update.service.js';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.js';
import { DOMSelectors } from '@shared/config/dom-selectors.js';
import { CSSClasses } from '@shared/config/css-classes.js';

describe('UpdateSectionComponent', () => {
  let component;
  let mockUpdateOrchestrator;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;
  let mockElements;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    mockLoggerFactory = {
      create: vi.fn(() => mockLogger)
    };

    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn(() => vi.fn())
    };

    mockUpdateOrchestrator = {
      getStatus: vi.fn(() => ({
        state: UpdateState.IDLE,
        updateInfo: null
      })),
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn()
    };

    mockElements = {
      section: document.createElement('section'),
      currentVersion: document.createElement('span'),
      statusIndicator: document.createElement('span'),
      statusText: document.createElement('span'),
      progressContainer: document.createElement('div'),
      progressFill: document.createElement('div'),
      progressText: document.createElement('span'),
      actionBtn: document.createElement('button'),
      badge: document.createElement('span')
    };

    mockElements.section.id = DOMSelectors.UPDATE_SECTION;
    mockElements.currentVersion.id = DOMSelectors.UPDATE_CURRENT_VERSION;
    mockElements.statusIndicator.id = DOMSelectors.UPDATE_STATUS_INDICATOR;
    mockElements.statusText.id = DOMSelectors.UPDATE_STATUS_TEXT;
    mockElements.progressContainer.id = DOMSelectors.UPDATE_PROGRESS_CONTAINER;
    mockElements.progressFill.id = DOMSelectors.UPDATE_PROGRESS_FILL;
    mockElements.progressText.id = DOMSelectors.UPDATE_PROGRESS_TEXT;
    mockElements.actionBtn.id = DOMSelectors.UPDATE_ACTION_BTN;
    mockElements.badge.id = DOMSelectors.UPDATE_BADGE;

    Object.values(mockElements).forEach(el => document.body.appendChild(el));

    component = new UpdateSectionComponent({
      updateOrchestrator: mockUpdateOrchestrator,
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create component with initial state', () => {
      expect(component._initialized).toBe(false);
      expect(component._subscriptions).toEqual([]);
      expect(component._activeTimeouts).toEqual([]);
    });
  });

  describe('initialize', () => {
    it('should cache DOM elements', () => {
      component.initialize();

      expect(component.elements.section).toBe(mockElements.section);
      expect(component.elements.actionBtn).toBe(mockElements.actionBtn);
      expect(component.elements.badge).toBe(mockElements.badge);
    });

    it('should subscribe to events', () => {
      component.initialize();

      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.UPDATE.STATE_CHANGED,
        expect.any(Function)
      );
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.UPDATE.PROGRESS,
        expect.any(Function)
      );
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.UPDATE.BADGE_SHOW,
        expect.any(Function)
      );
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.UPDATE.BADGE_HIDE,
        expect.any(Function)
      );
    });

    it('should load initial state', () => {
      mockUpdateOrchestrator.getStatus.mockReturnValue({
        state: UpdateState.AVAILABLE,
        updateInfo: { version: '2.0.0' }
      });

      component.initialize();

      expect(mockElements.statusText.textContent).toBe('v2.0.0 available');
    });

    it('should show badge for AVAILABLE state', () => {
      mockUpdateOrchestrator.getStatus.mockReturnValue({
        state: UpdateState.AVAILABLE,
        updateInfo: { version: '2.0.0' }
      });

      component.initialize();

      expect(mockElements.badge.classList.contains(CSSClasses.HIDDEN)).toBe(false);
    });

    it('should warn if already initialized', () => {
      component.initialize();
      component.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith('UpdateSectionComponent already initialized');
    });
  });

  describe('_updateUI', () => {
    beforeEach(() => {
      component.initialize();
    });

    it('should handle null status', () => {
      component._updateUI(null);
      expect(mockElements.statusText.textContent).toBeTruthy();
    });

    it('should update for IDLE state', () => {
      component._updateUI({ state: UpdateState.IDLE, updateInfo: null });

      expect(mockElements.statusText.textContent).toBe('Up to date');
      expect(mockElements.actionBtn.textContent).toBe('Check for Updates');
    });

    it('should update for CHECKING state', () => {
      component._updateUI({ state: UpdateState.CHECKING, updateInfo: null });

      expect(mockElements.statusText.textContent).toBe('Checking for updates...');
      expect(mockElements.actionBtn.textContent).toBe('Checking...');
      expect(mockElements.actionBtn.disabled).toBe(true);
    });

    it('should update for AVAILABLE state', () => {
      component._updateUI({ state: UpdateState.AVAILABLE, updateInfo: { version: '2.0.0' } });

      expect(mockElements.statusText.textContent).toBe('v2.0.0 available');
      expect(mockElements.actionBtn.textContent).toBe('Download Update');
      expect(mockElements.section.classList.contains(CSSClasses.UPDATE_AVAILABLE)).toBe(true);
    });

    it('should update for DOWNLOADING state', () => {
      component._updateUI({ state: UpdateState.DOWNLOADING, updateInfo: null });

      expect(mockElements.statusText.textContent).toBe('Downloading...');
      expect(mockElements.actionBtn.textContent).toBe('Downloading...');
      expect(mockElements.actionBtn.disabled).toBe(true);
      expect(mockElements.progressContainer.classList.contains(CSSClasses.HIDDEN)).toBe(false);
    });

    it('should update for DOWNLOADED state', () => {
      component._updateUI({ state: UpdateState.DOWNLOADED, updateInfo: { version: '2.0.0' } });

      expect(mockElements.statusText.textContent).toBe('v2.0.0 ready to install');
      expect(mockElements.actionBtn.textContent).toBe('Install & Restart');
      expect(mockElements.actionBtn.classList.contains('btn-install')).toBe(true);
    });

    it('should update for ERROR state', () => {
      component._updateUI({ state: UpdateState.ERROR, updateInfo: null });

      expect(mockElements.statusText.textContent).toBe('Update failed');
      expect(mockElements.actionBtn.textContent).toBe('Check for Updates');
    });
  });

  describe('_updateProgress', () => {
    beforeEach(() => {
      component.initialize();
    });

    it('should update progress bar width', () => {
      component._updateProgress({ percent: 75 });

      expect(mockElements.progressFill.style.width).toBe('75%');
    });

    it('should update progress text', () => {
      component._updateProgress({ percent: 75.5 });

      expect(mockElements.progressText.textContent).toBe('76%');
    });

    it('should handle null progress', () => {
      component._updateProgress(null);
      expect(mockElements.progressFill.style.width).toBe('');
    });
  });

  describe('_showBadge / _hideBadge', () => {
    beforeEach(() => {
      component.initialize();
    });

    it('should show badge by removing hidden class', () => {
      mockElements.badge.classList.add(CSSClasses.HIDDEN);
      component._showBadge();

      expect(mockElements.badge.classList.contains(CSSClasses.HIDDEN)).toBe(false);
    });

    it('should hide badge by adding hidden class', () => {
      component._hideBadge();

      expect(mockElements.badge.classList.contains(CSSClasses.HIDDEN)).toBe(true);
    });
  });

  describe('_handleActionClick', () => {
    beforeEach(() => {
      component.initialize();
    });

    it('should call checkForUpdates for IDLE state', async () => {
      mockUpdateOrchestrator.getStatus.mockReturnValue({ state: UpdateState.IDLE });

      await component._handleActionClick();

      expect(mockUpdateOrchestrator.checkForUpdates).toHaveBeenCalled();
    });

    it('should call checkForUpdates for NOT_AVAILABLE state', async () => {
      mockUpdateOrchestrator.getStatus.mockReturnValue({ state: UpdateState.NOT_AVAILABLE });

      await component._handleActionClick();

      expect(mockUpdateOrchestrator.checkForUpdates).toHaveBeenCalled();
    });

    it('should call checkForUpdates for ERROR state', async () => {
      mockUpdateOrchestrator.getStatus.mockReturnValue({ state: UpdateState.ERROR });

      await component._handleActionClick();

      expect(mockUpdateOrchestrator.checkForUpdates).toHaveBeenCalled();
    });

    it('should call downloadUpdate for AVAILABLE state', async () => {
      mockUpdateOrchestrator.getStatus.mockReturnValue({ state: UpdateState.AVAILABLE });

      await component._handleActionClick();

      expect(mockUpdateOrchestrator.downloadUpdate).toHaveBeenCalled();
    });

    it('should call installUpdate for DOWNLOADED state', async () => {
      mockUpdateOrchestrator.getStatus.mockReturnValue({ state: UpdateState.DOWNLOADED });

      await component._handleActionClick();

      expect(mockUpdateOrchestrator.installUpdate).toHaveBeenCalled();
    });

    it('should disable button during action', async () => {
      mockUpdateOrchestrator.getStatus.mockReturnValue({ state: UpdateState.IDLE });
      mockUpdateOrchestrator.checkForUpdates.mockImplementation(() => {
        expect(mockElements.actionBtn.disabled).toBe(true);
        return Promise.resolve();
      });

      await component._handleActionClick();
    });

    it('should not execute if button is disabled', async () => {
      mockElements.actionBtn.disabled = true;

      await component._handleActionClick();

      expect(mockUpdateOrchestrator.checkForUpdates).not.toHaveBeenCalled();
    });
  });

  describe('setCurrentVersion', () => {
    beforeEach(() => {
      component.initialize();
    });

    it('should set version with v prefix', () => {
      component.setCurrentVersion('1.0.0');

      expect(mockElements.currentVersion.textContent).toBe('v1.0.0');
    });

    it('should not double prefix if already has v', () => {
      component.setCurrentVersion('v1.0.0');

      expect(mockElements.currentVersion.textContent).toBe('v1.0.0');
    });
  });

  describe('dispose', () => {
    beforeEach(() => {
      component.initialize();
    });

    it('should call subscription cleanup functions', () => {
      const unsub1 = vi.fn();
      const unsub2 = vi.fn();
      component._subscriptions = [unsub1, unsub2];

      component.dispose();

      expect(unsub1).toHaveBeenCalled();
      expect(unsub2).toHaveBeenCalled();
    });

    it('should clear active timeouts', () => {
      vi.useFakeTimers();
      const callback = vi.fn();
      component._scheduleTimeout(callback, 1000);

      component.dispose();

      vi.advanceTimersByTime(2000);
      expect(callback).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should reset initialized flag', () => {
      component.dispose();

      expect(component._initialized).toBe(false);
    });
  });

  describe('event subscriptions', () => {
    let eventHandlers;

    beforeEach(() => {
      eventHandlers = {};
      mockEventBus.subscribe.mockImplementation((event, handler) => {
        eventHandlers[event] = handler;
        return vi.fn();
      });

      component.initialize();
    });

    it('should update UI on STATE_CHANGED event', () => {
      const status = { state: UpdateState.AVAILABLE, updateInfo: { version: '2.0.0' } };
      eventHandlers[EventChannels.UPDATE.STATE_CHANGED](status);

      expect(mockElements.statusText.textContent).toBe('v2.0.0 available');
    });

    it('should update progress on PROGRESS event', () => {
      eventHandlers[EventChannels.UPDATE.PROGRESS]({ percent: 50 });

      expect(mockElements.progressFill.style.width).toBe('50%');
    });

    it('should show badge on BADGE_SHOW event', () => {
      mockElements.badge.classList.add(CSSClasses.HIDDEN);
      eventHandlers[EventChannels.UPDATE.BADGE_SHOW]();

      expect(mockElements.badge.classList.contains(CSSClasses.HIDDEN)).toBe(false);
    });

    it('should hide badge on BADGE_HIDE event', () => {
      eventHandlers[EventChannels.UPDATE.BADGE_HIDE]();

      expect(mockElements.badge.classList.contains(CSSClasses.HIDDEN)).toBe(true);
    });
  });
});
