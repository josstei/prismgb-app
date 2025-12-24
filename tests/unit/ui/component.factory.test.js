/**
 * UIComponentFactory Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UIComponentFactory } from '@renderer/ui/controller/component.factory.js';

// Mock the component imports with proper class implementations
vi.mock('@renderer/ui/components/status-notification.js', () => ({
  StatusNotificationComponent: class {
    constructor(config) {
      this.type = 'StatusNotification';
      this.config = config;
    }
  }
}));

vi.mock('@renderer/ui/components/device-status.js', () => ({
  DeviceStatusComponent: class {
    constructor(config) {
      this.type = 'DeviceStatus';
      this.config = config;
    }
  }
}));

vi.mock('@renderer/features/streaming/ui/stream-controls.js', () => ({
  StreamControlsComponent: class {
    constructor(config) {
      this.type = 'StreamControls';
      this.config = config;
    }
  }
}));

vi.mock('@renderer/features/settings/ui/settings-menu.js', () => ({
  SettingsMenuComponent: class {
    constructor(config) {
      this.type = 'SettingsMenu';
      this.config = config;
    }
  }
}));

describe('UIComponentFactory', () => {
  let factory;
  let mockEventBus;

  beforeEach(() => {
    vi.clearAllMocks();

    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn()
    };

    factory = new UIComponentFactory({ eventBus: mockEventBus });
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
      const config = { settingsService: {}, logger: {} };

      const component = factory.createSettingsMenuComponent(config);

      expect(component.type).toBe('SettingsMenu');
      expect(component.config.settingsService).toBe(config.settingsService);
      expect(component.config.eventBus).toBe(mockEventBus);
    });

    it('should merge eventBus from factory with provided config', () => {
      const config = { settingsService: {}, logger: {}, customProp: 'test' };

      const component = factory.createSettingsMenuComponent(config);

      expect(component.config.customProp).toBe('test');
      expect(component.config.eventBus).toBe(mockEventBus);
    });
  });
});
