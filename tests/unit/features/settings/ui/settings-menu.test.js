/**
 * SettingsMenuComponent Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SettingsMenuComponent } from '@renderer/features/settings/ui/settings-menu.component.js';

describe('SettingsMenuComponent', () => {
  let component;
  let mockSettingsService;
  let mockEventBus;
  let mockLogger;
  let mockElements;

  beforeEach(() => {
    // Mock settings service
    mockSettingsService = {
      getStatusStripVisible: vi.fn(() => true),
      setStatusStripVisible: vi.fn(),
      getPerformanceMode: vi.fn(() => true),
      setPerformanceMode: vi.fn()
    };

    // Mock event bus
    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn()
    };

    // Mock logger
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    // Create mock DOM elements
    mockElements = {
      settingsMenuContainer: document.createElement('div'),
      settingsBtn: document.createElement('button'),
      settingStatusStrip: document.createElement('input'),
      settingAnimationSaver: document.createElement('input'),
      disclaimerBtn: document.createElement('button'),
      disclaimerContent: document.createElement('div'),
      footer: document.createElement('footer')
    };

    // Set up checkbox inputs
    mockElements.settingStatusStrip.type = 'checkbox';
    mockElements.settingStatusStrip.checked = true;
    mockElements.settingAnimationSaver.type = 'checkbox';
    mockElements.settingAnimationSaver.checked = true;

    // Set up footer
    mockElements.footer.classList.add('footer');

    component = new SettingsMenuComponent({
      settingsService: mockSettingsService,
      eventBus: mockEventBus,
      logger: mockLogger
    });
  });

  afterEach(() => {
    component.dispose();
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create component with default state', () => {
      expect(component.isVisible).toBe(false);
      expect(component.disclaimerExpanded).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should initialize with DOM elements', () => {
      component.initialize(mockElements);

      expect(component.container).toBe(mockElements.settingsMenuContainer);
      expect(component.toggleButton).toBe(mockElements.settingsBtn);
      expect(component.statusStripCheckbox).toBe(mockElements.settingStatusStrip);
      expect(component.animationSaverCheckbox).toBe(mockElements.settingAnimationSaver);
    });

    it('should warn if required elements are missing', () => {
      component.initialize({});

      expect(mockLogger.warn).toHaveBeenCalledWith('Settings menu elements not found');
    });

    it('should load current settings on initialize', () => {
      component.initialize(mockElements);

      expect(mockSettingsService.getStatusStripVisible).toHaveBeenCalled();
      expect(mockSettingsService.getPerformanceMode).toHaveBeenCalled();
      expect(mockElements.settingStatusStrip.checked).toBe(true);
      expect(mockElements.settingAnimationSaver.checked).toBe(true);
    });

    it('should apply status strip visibility on initialize', () => {
      mockSettingsService.getStatusStripVisible.mockReturnValue(false);

      component.initialize(mockElements);

      expect(mockElements.footer.classList.contains('status-hidden')).toBe(true);
    });

    it('should log initialization success', () => {
      component.initialize(mockElements);

      expect(mockLogger.debug).toHaveBeenCalledWith('SettingsMenuComponent initialized');
    });
  });

  describe('toggle', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should show menu when hidden', () => {
      component.toggle();

      expect(component.isVisible).toBe(true);
      expect(mockElements.settingsMenuContainer.classList.contains('visible')).toBe(true);
    });

    it('should hide menu when visible', () => {
      component.show();
      component.toggle();

      expect(component.isVisible).toBe(false);
      expect(mockElements.settingsMenuContainer.classList.contains('visible')).toBe(false);
    });
  });

  describe('show', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should display the menu', () => {
      component.show();

      expect(mockElements.settingsMenuContainer.classList.contains('visible')).toBe(true);
      expect(component.isVisible).toBe(true);
    });

    it('should set aria-expanded on toggle button', () => {
      component.show();

      expect(mockElements.settingsBtn.getAttribute('aria-expanded')).toBe('true');
    });

    it('should log when shown', () => {
      component.show();

      expect(mockLogger.debug).toHaveBeenCalledWith('Settings menu shown');
    });
  });

  describe('hide', () => {
    beforeEach(() => {
      component.initialize(mockElements);
      component.show();
    });

    it('should hide the menu', () => {
      component.hide();

      expect(mockElements.settingsMenuContainer.classList.contains('visible')).toBe(false);
      expect(component.isVisible).toBe(false);
    });

    it('should set aria-expanded to false', () => {
      component.hide();

      expect(mockElements.settingsBtn.getAttribute('aria-expanded')).toBe('false');
    });

    it('should collapse disclaimer when hiding menu', () => {
      // Expand disclaimer first
      component._expandDisclaimer();
      expect(component.disclaimerExpanded).toBe(true);

      component.hide();

      expect(component.disclaimerExpanded).toBe(false);
    });

    it('should log when hidden', () => {
      component.hide();

      expect(mockLogger.debug).toHaveBeenCalledWith('Settings menu hidden');
    });
  });

  describe('Status strip toggle', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should update settings when checkbox changes', () => {
      mockElements.settingStatusStrip.checked = false;
      mockElements.settingStatusStrip.dispatchEvent(new Event('change'));

      expect(mockSettingsService.setStatusStripVisible).toHaveBeenCalledWith(false);
    });

    it('should add status-hidden class when unchecked', () => {
      mockElements.settingStatusStrip.checked = false;
      mockElements.settingStatusStrip.dispatchEvent(new Event('change'));

      expect(mockElements.footer.classList.contains('status-hidden')).toBe(true);
    });

    it('should remove status-hidden class when checked', () => {
      mockElements.footer.classList.add('status-hidden');
      mockElements.settingStatusStrip.checked = true;
      mockElements.settingStatusStrip.dispatchEvent(new Event('change'));

      expect(mockElements.footer.classList.contains('status-hidden')).toBe(false);
    });
  });

  describe('Animation power saver toggle', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should update settings when checkbox changes', () => {
      mockElements.settingAnimationSaver.checked = false;
      mockElements.settingAnimationSaver.dispatchEvent(new Event('change'));

      expect(mockSettingsService.setPerformanceMode).toHaveBeenCalledWith(false);
    });

    it('should reflect stored preference on initialize', () => {
      mockSettingsService.getPerformanceMode.mockReturnValue(false);

      component.initialize(mockElements);

      expect(mockElements.settingAnimationSaver.checked).toBe(false);
    });

    it('should default to false when getPerformanceMode method is missing', () => {
      const serviceWithoutMethod = {
        getStatusStripVisible: vi.fn(() => false),
        setStatusStripVisible: vi.fn(),
        setPerformanceMode: vi.fn()
      };

      const componentWithLimitedService = new SettingsMenuComponent({
        settingsService: serviceWithoutMethod,
        eventBus: mockEventBus,
        logger: mockLogger
      });

      mockElements.settingAnimationSaver.checked = true;
      componentWithLimitedService.initialize(mockElements);

      expect(mockElements.settingAnimationSaver.checked).toBe(false);

      componentWithLimitedService.dispose();
    });
  });

  describe('Disclaimer toggle', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should expand disclaimer when collapsed', () => {
      mockElements.disclaimerBtn.click();

      expect(component.disclaimerExpanded).toBe(true);
      expect(mockElements.disclaimerContent.classList.contains('visible')).toBe(true);
    });

    it('should collapse disclaimer when expanded', () => {
      mockElements.disclaimerBtn.click(); // expand
      mockElements.disclaimerBtn.click(); // collapse

      expect(component.disclaimerExpanded).toBe(false);
      expect(mockElements.disclaimerContent.classList.contains('visible')).toBe(false);
    });

    it('should update aria-expanded attribute', () => {
      mockElements.disclaimerBtn.click();

      expect(mockElements.disclaimerBtn.getAttribute('aria-expanded')).toBe('true');
    });
  });

  describe('Click outside', () => {
    beforeEach(() => {
      component.initialize(mockElements);
      component.show();
    });

    it('should hide menu when clicking outside', () => {
      // Create a target element outside the menu with closest method
      const outsideElement = document.createElement('div');
      outsideElement.closest = vi.fn(() => null);

      const clickEvent = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(clickEvent, 'target', {
        value: outsideElement,
        enumerable: true
      });

      document.dispatchEvent(clickEvent);

      expect(component.isVisible).toBe(false);
    });

    it('should not hide when clicking inside menu', () => {
      // Create a target element inside the menu
      const insideElement = document.createElement('div');
      insideElement.closest = vi.fn((selector) => {
        if (selector === '.settings-menu-container') return mockElements.settingsMenuContainer;
        return null;
      });

      const clickEvent = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(clickEvent, 'target', {
        value: insideElement,
        enumerable: true
      });

      document.dispatchEvent(clickEvent);

      // Menu should stay visible
      expect(component.isVisible).toBe(true);
    });
  });

  describe('Escape key', () => {
    beforeEach(() => {
      component.initialize(mockElements);
      component.show();
    });

    it('should hide menu on Escape key', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(component.isVisible).toBe(false);
    });

    it('should not hide when not visible', () => {
      component.hide();

      // Spy on hide after it's already been called
      const hideSpy = vi.spyOn(component, 'hide');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      // hide() should not be called when menu is not visible
      expect(hideSpy).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should remove click outside handler', () => {
      component.initialize(mockElements);

      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      component.dispose();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function), undefined);
    });

    it('should remove escape key handler', () => {
      component.initialize(mockElements);

      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      component.dispose();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function), undefined);
    });

    it('should clear all listeners via manager', () => {
      component.initialize(mockElements);
      expect(component._domListeners.count()).toBeGreaterThan(0);

      component.dispose();

      expect(component._domListeners.count()).toBe(0);
    });
  });
});
