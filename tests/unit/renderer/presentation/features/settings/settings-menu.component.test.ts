// @ts-nocheck
/**
 * SettingsMenuComponent Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SettingsMenuComponent } from '@renderer/presentation/features/settings/settings-menu.component.js';
import {
  createSettingsMenuTemplate,
  createSettingsControlsTemplate,
  getRecordingFormatOptions
} from '@renderer/presentation/features/settings/settings-menu.template.js';
import { SettingsDefinitions } from '@renderer/lib/settings.definitions.js';
import { TRANSCODE_CONFIG } from '@platform/transcode';
import {
  createEventBus,
  createLogger,
  createSettingsMenuElementsMock,
  createSettingsServiceMock
} from '../../../../../factories/index.js';

describe('SettingsMenuComponent', () => {
  let component;
  let mockSettingsService;
  let mockEventBus;
  let mockLogger;
  let mockElements;

  beforeEach(() => {
    mockSettingsService = createSettingsServiceMock({
      values: {
        statusStripVisible: true,
        fullscreenOnStartup: false,
        autoStreamOnConnect: false,
        minimalistFullscreen: false,
        performanceMode: true,
        recordingFormat: 'webm'
      }
    });

    mockEventBus = createEventBus();
    mockLogger = createLogger();

    mockElements = createSettingsMenuElementsMock();
    mockElements.settingStatusStrip.checked = true;
    mockElements.settingAnimationSaver.checked = true;

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

  describe('template contract', () => {
    it('derives settings controls from settings definition UI metadata', () => {
      const controlsTemplate = createSettingsControlsTemplate();
      const uiDefinitions = SettingsDefinitions.definitions
        .filter((definition) => definition.ui?.controlId)
        .sort((a, b) => (a.ui.order ?? 0) - (b.ui.order ?? 0));

      for (const definition of uiDefinitions) {
        expect(controlsTemplate).toContain(`id="${definition.ui.controlId}"`);
        expect(controlsTemplate).toContain(definition.ui.title);
      }

      const renderedControlPositions = uiDefinitions.map((definition) =>
        controlsTemplate.indexOf(`id="${definition.ui.controlId}"`)
      );

      expect(renderedControlPositions).toEqual([...renderedControlPositions].sort((a, b) => a - b));
    });

    it('derives recording format options from transcode config', () => {
      const template = createSettingsMenuTemplate();
      const options = getRecordingFormatOptions();

      expect(options.map((option) => option.value)).toEqual(Object.keys(TRANSCODE_CONFIG.formats));
      expect(options.find((option) => option.value === 'webm')).toMatchObject({
        label: 'WebM',
        active: true
      });

      for (const format of Object.keys(TRANSCODE_CONFIG.formats)) {
        expect(template).toContain(`data-value="${format}"`);
      }
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

      expect(mockSettingsService.getBooleanSetting).toHaveBeenCalledWith('statusStripVisible');
      expect(mockSettingsService.getBooleanSetting).toHaveBeenCalledWith('performanceMode');
      expect(mockElements.settingStatusStrip.checked).toBe(true);
      expect(mockElements.settingAnimationSaver.checked).toBe(true);
    });

    it('should apply status strip visibility on initialize', () => {
      mockSettingsService.setSetting('statusStripVisible', false);

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

      expect(mockSettingsService.setSetting).toHaveBeenCalledWith('statusStripVisible', false);
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

      expect(mockSettingsService.setSetting).toHaveBeenCalledWith('performanceMode', false);
    });

    it('should reflect stored preference on initialize', () => {
      mockSettingsService.setSetting('performanceMode', false);

      component.initialize(mockElements);

      expect(mockElements.settingAnimationSaver.checked).toBe(false);
    });

    it('should use generic setting access when loading animation preference', () => {
      const serviceWithoutMethod = createSettingsServiceMock({
        values: {
          performanceMode: false,
          recordingFormat: 'webm'
        }
      });

      const componentWithLimitedService = new SettingsMenuComponent({
        settingsService: serviceWithoutMethod,
        eventBus: mockEventBus,
        logger: mockLogger
      });

      mockElements.settingAnimationSaver.checked = true;
      componentWithLimitedService.initialize(mockElements);

      expect(serviceWithoutMethod.getBooleanSetting).toHaveBeenCalledWith('performanceMode');
      expect(mockElements.settingAnimationSaver.checked).toBe(false);

      componentWithLimitedService.dispose();
    });
  });

  describe('launch on login toggle', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should set launchOnLogin when checkbox changes', () => {
      mockElements.settingLaunchOnLogin.checked = true;
      mockElements.settingLaunchOnLogin.dispatchEvent(new Event('change'));

      expect(mockSettingsService.setSetting).toHaveBeenCalledWith('launchOnLogin', true);
    });

    it('should load saved state on initialization', async () => {
      mockSettingsService.setSetting('launchOnLogin', true);
      await component._loadAsyncSettings({ isActive: () => true });

      expect(mockElements.settingLaunchOnLogin.checked).toBe(true);
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
      // Create a target element that is actually inside the menu container
      const insideElement = document.createElement('div');
      mockElements.settingsMenuContainer.appendChild(insideElement);

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
    it('should remove click outside handler', async () => {
      component.initialize(mockElements);

      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      await component.dispose();

      expect(removeEventListenerSpy).toHaveBeenCalled();
      expect(removeEventListenerSpy.mock.calls.some(call => call[0] === 'click')).toBe(true);
    });

    it('should remove escape key handler', async () => {
      component.initialize(mockElements);

      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      await component.dispose();

      expect(removeEventListenerSpy).toHaveBeenCalled();
      expect(removeEventListenerSpy.mock.calls.some(call => call[0] === 'keydown')).toBe(true);
    });

    it('should clear all listeners via manager', async () => {
      component.initialize(mockElements);
      expect(component.lifecycle.disposables.size).toBeGreaterThan(0);

      await component.dispose();

      expect(component.lifecycle.disposables.size).toBe(0);
    });
  });
});
