/**
 * UIComponentFactory Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UIComponentFactory } from '@renderer/ui/controller/component.factory.js';

// Mock the component imports with proper class implementations
vi.mock('@renderer/ui/components/status-notification.component.js', () => ({
  StatusNotificationComponent: class {
    constructor(config) {
      this.type = 'StatusNotification';
      this.config = config;
    }
  }
}));

vi.mock('@renderer/ui/components/device-status.component.js', () => ({
  DeviceStatusComponent: class {
    constructor(config) {
      this.type = 'DeviceStatus';
      this.config = config;
    }
  }
}));

// Create mock component classes that will be injected via DI
class MockStreamControlsComponent {
  constructor(config) {
    this.type = 'StreamControls';
    this.config = config;
  }
}

class MockSettingsMenuComponent {
  constructor(config) {
    this.type = 'SettingsMenu';
    this.settingsService = config.settingsService;
    this.updateSectionComponent = config.updateSectionComponent;
    this.eventBus = config.eventBus;
    this.loggerFactory = config.loggerFactory;
    this.logger = config.logger;
  }
}

class MockShaderSelectorComponent {
  constructor(config) {
    this.type = 'ShaderSelector';
    this.config = config;
  }
}

class MockUpdateSectionComponent {
  constructor(config) {
    this.type = 'UpdateSection';
    this.updateOrchestrator = config.updateOrchestrator;
    this.eventBus = config.eventBus;
    this.loggerFactory = config.loggerFactory;
  }
}

describe('UIComponentFactory', () => {
  let factory;
  let mockEventBus;

  beforeEach(() => {
    vi.clearAllMocks();

    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn()
    };

    // Create factory with injected component classes
    factory = new UIComponentFactory({
      eventBus: mockEventBus,
      settingsMenuComponent: MockSettingsMenuComponent,
      streamControlsComponent: MockStreamControlsComponent,
      shaderSelectorComponent: MockShaderSelectorComponent,
      updateSectionComponent: MockUpdateSectionComponent
    });
  });

  describe('constructor', () => {
    it('should create factory with eventBus dependency', () => {
      expect(factory.eventBus).toBe(mockEventBus);
    });
  });

  describe('createStatusNotificationComponent', () => {
    it('should create StatusNotificationComponent with config', () => {
      const config = { statusMessage: { textContent: '' } };

      const component = factory.createStatusNotificationComponent(config);

      expect(component.type).toBe('StatusNotification');
      expect(component.config).toBe(config);
    });
  });

  describe('createDeviceStatusComponent', () => {
    it('should create DeviceStatusComponent with config', () => {
      const config = { deviceStatus: {}, deviceName: {} };

      const component = factory.createDeviceStatusComponent(config);

      expect(component.type).toBe('DeviceStatus');
      expect(component.config).toBe(config);
    });
  });

  describe('createStreamControlsComponent', () => {
    it('should create StreamControlsComponent with config', () => {
      const config = { screenshotBtn: {}, recordBtn: {} };

      const component = factory.createStreamControlsComponent(config);

      expect(component.type).toBe('StreamControls');
      expect(component.config).toBe(config);
    });
  });

  describe('createSettingsMenuComponent', () => {
    it('should create SettingsMenuComponent with config and eventBus', () => {
      const mockSettingsService = { getSettings: vi.fn() };
      const mockLogger = { debug: vi.fn() };
      const config = { settingsService: mockSettingsService, logger: mockLogger };

      const component = factory.createSettingsMenuComponent(config);

      expect(component.type).toBe('SettingsMenu');
      expect(component.settingsService).toBe(mockSettingsService);
      expect(component.eventBus).toBe(mockEventBus);
      expect(component.logger).toBe(mockLogger);
    });

    it('should create UpdateSectionComponent when updateOrchestrator is provided', () => {
      const mockUpdateOrchestrator = { checkForUpdates: vi.fn() };
      const mockLoggerFactory = { create: vi.fn() };
      const config = {
        settingsService: {},
        updateOrchestrator: mockUpdateOrchestrator,
        loggerFactory: mockLoggerFactory
      };

      const component = factory.createSettingsMenuComponent(config);

      expect(component.type).toBe('SettingsMenu');
      expect(component.updateSectionComponent).toBeDefined();
      expect(component.updateSectionComponent.type).toBe('UpdateSection');
      expect(component.updateSectionComponent.updateOrchestrator).toBe(mockUpdateOrchestrator);
    });

    it('should not create UpdateSectionComponent when updateOrchestrator is not provided', () => {
      const config = { settingsService: {} };

      const component = factory.createSettingsMenuComponent(config);

      expect(component.updateSectionComponent).toBeNull();
    });
  });
});
