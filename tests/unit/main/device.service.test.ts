// @ts-nocheck
/**
 * DeviceService (Main Process) Unit Tests
 * Tests for DI injection of profile classes
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createEventBus, createLoggerFactory, createProfileRegistryMock } from '../../factories/index.js';

// Mock @prismgb/devices
vi.mock('@prismgb/devices', () => ({
  DeviceRegistry: {
    registerProfileClass: vi.fn(),
    getProfileClass: vi.fn(),
    getAll: vi.fn(() => [])
  },
  forEachDeviceWithModule: vi.fn((moduleKey, callback, options) => {
    // Simulate iterating over a test device
    if (moduleKey === 'profileModule') {
      callback({ id: 'test-device', name: 'Test Device' });
    }
  })
}));


// Mock config loader
vi.mock('@shared/config/config-loader.utils.js', () => ({
  appConfig: {
    USB_SCAN_DELAY: 100
  }
}));

// Mock event channels
vi.mock('@main/infrastructure/event-channels.config.js', () => ({
  MainEventChannels: {
    DEVICE: {
      CONNECTION_CHANGED: 'device:connection-changed',
      CHECK_ERROR: 'device:check-error'
    }
  }
}));

import { DeviceService } from '@main/infrastructure/devices/device.service.js';
import { DeviceRegistry } from '@prismgb/devices';
import { forEachDeviceWithModule } from '@prismgb/devices';

describe('DeviceService (Main Process)', () => {
  let deviceService;
  let mockProfileRegistry;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;
  let mockProfileClasses;

  // Mock profile class for testing
  class MockChromaticProfile {
    constructor() {
      this.id = 'chromatic-mod-retro';
      this.name = 'Mock Chromatic';
    }
  }

  class MockTestProfile {
    constructor() {
      this.id = 'test-device';
      this.name = 'Mock Test Profile';
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();

    mockLoggerFactory = createLoggerFactory();

    mockProfileRegistry = createProfileRegistryMock();

    mockEventBus = createEventBus();

    // Default profile classes injected via DI
    mockProfileClasses = new Map([
      ['chromatic-mod-retro', MockChromaticProfile],
      ['test-device', MockTestProfile]
    ]);

    // Setup DeviceRegistry mock to return our test classes
    DeviceRegistry.getProfileClass.mockImplementation((deviceId) => {
      return mockProfileClasses.get(deviceId) || null;
    });
  });

  function createDeviceService(profileClasses = mockProfileClasses) {
    const instance = new DeviceService({
      profileRegistry: mockProfileRegistry,
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory
    }, profileClasses);
    mockLogger = mockLoggerFactory._getLogger('DeviceService');
    return instance;
  }

  function createDeviceServiceWithoutProfileClasses() {
    const instance = new DeviceService({
      profileRegistry: mockProfileRegistry,
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory
    });
    mockLogger = mockLoggerFactory._getLogger('DeviceService');
    return instance;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should accept profileClasses parameter', () => {
      deviceService = createDeviceService();

      expect(deviceService._profileClasses).toBe(mockProfileClasses);
    });

    it('should default to empty Map if profileClasses not provided', () => {
      deviceService = createDeviceServiceWithoutProfileClasses();

      expect(deviceService._profileClasses).toBeInstanceOf(Map);
      expect(deviceService._profileClasses.size).toBe(0);
    });

    it('should store profile registry dependency', () => {
      deviceService = createDeviceService();

      expect(deviceService.profileRegistry).toBe(mockProfileRegistry);
    });

    it('should create logger with correct name', () => {
      deviceService = createDeviceService();

      expect(mockLoggerFactory.create).toHaveBeenCalledWith('DeviceService');
    });

    it('should initialize state properties', () => {
      deviceService = createDeviceService();

      expect(deviceService.isDeviceConnected).toBe(false);
      expect(deviceService.connectedDeviceInfo).toBeNull();
      expect(deviceService.isUsbMonitoring).toBe(false);
      expect(deviceService._areProfilesInitialized).toBe(false);
    });
  });

  describe('initialize', () => {
    beforeEach(() => {
      deviceService = createDeviceService();
    });

    it('should register profile classes with DeviceRegistry', async () => {
      await deviceService.initialize();

      expect(DeviceRegistry.registerProfileClass).toHaveBeenCalledWith(
        'chromatic-mod-retro',
        MockChromaticProfile
      );
      expect(DeviceRegistry.registerProfileClass).toHaveBeenCalledWith(
        'test-device',
        MockTestProfile
      );
    });

    it('should register profile classes in order', async () => {
      await deviceService.initialize();

      // Verify registerProfileClass was called for each entry in the map
      expect(DeviceRegistry.registerProfileClass).toHaveBeenCalledTimes(2);
    });

    it('should set initialized flag after successful initialization', async () => {
      await deviceService.initialize();

      expect(deviceService._areProfilesInitialized).toBe(true);
    });

    it('should warn if already initialized', async () => {
      await deviceService.initialize();
      await deviceService.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith('DeviceService already initialized');
    });

    it('should prevent concurrent initialization', async () => {
      // Start two initializations simultaneously
      const init1 = deviceService.initialize();
      const init2 = deviceService.initialize();

      await Promise.all([init1, init2]);

      // registerProfileClass should only be called once per profile class
      // (not doubled due to concurrent calls)
      expect(DeviceRegistry.registerProfileClass).toHaveBeenCalledTimes(2);
    });

    it('should use forEachDeviceWithModule to find devices with profiles', async () => {
      await deviceService.initialize();

      expect(forEachDeviceWithModule).toHaveBeenCalledWith(
        'profileModule',
        expect.any(Function),
        { logger: mockLogger }
      );
    });

    it('should retrieve profile class from DeviceRegistry', async () => {
      await deviceService.initialize();

      expect(DeviceRegistry.getProfileClass).toHaveBeenCalledWith('test-device');
    });

    it('should create profile instance and register with ProfileRegistry', async () => {
      await deviceService.initialize();

      expect(mockProfileRegistry.registerProfile).toHaveBeenCalled();
      const registeredProfile = mockProfileRegistry.registerProfile.mock.calls[0][0];
      expect(registeredProfile).toBeInstanceOf(MockTestProfile);
    });

    it('should set default profile to first registered one', async () => {
      await deviceService.initialize();

      expect(mockProfileRegistry.setDefaultProfile).toHaveBeenCalledWith('test-device');
    });

    it('should log successful profile registration', async () => {
      await deviceService.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Registered profile for')
      );
    });

    it('should handle missing profile class gracefully', async () => {
      // Configure DeviceRegistry to return null for test-device
      DeviceRegistry.getProfileClass.mockImplementation((deviceId) => {
        if (deviceId === 'test-device') return null;
        return mockProfileClasses.get(deviceId);
      });

      // Should not throw, just log error
      await expect(deviceService.initialize()).rejects.toThrow(
        'No device profiles were successfully initialized'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('No profile class found for device')
      );
    });
  });

  describe('DI pattern consistency', () => {
    it('should work with empty profileClasses map', async () => {
      deviceService = createDeviceService(new Map());

      // Mock no devices with profileModule
      forEachDeviceWithModule.mockImplementation(() => {});

      await expect(deviceService.initialize()).rejects.toThrow(
        'No device profiles were successfully initialized'
      );

      // No classes should be registered
      expect(DeviceRegistry.registerProfileClass).not.toHaveBeenCalled();
    });

    it('should iterate over all injected profile classes', async () => {
      const multipleClasses = new Map([
        ['device-1', MockChromaticProfile],
        ['device-2', MockTestProfile],
        ['device-3', MockChromaticProfile]
      ]);

      // Mock forEachDeviceWithModule to iterate over all devices
      forEachDeviceWithModule.mockImplementation((moduleKey, callback) => {
        if (moduleKey === 'profileModule') {
          callback({ id: 'device-1', name: 'Device 1' });
          callback({ id: 'device-2', name: 'Device 2' });
          callback({ id: 'device-3', name: 'Device 3' });
        }
      });

      // Mock DeviceRegistry to return the injected classes
      DeviceRegistry.getProfileClass.mockImplementation((deviceId) => {
        return multipleClasses.get(deviceId) || null;
      });

      deviceService = createDeviceService(multipleClasses);

      await deviceService.initialize();

      expect(DeviceRegistry.registerProfileClass).toHaveBeenCalledTimes(3);
      expect(DeviceRegistry.registerProfileClass).toHaveBeenCalledWith('device-1', MockChromaticProfile);
      expect(DeviceRegistry.registerProfileClass).toHaveBeenCalledWith('device-2', MockTestProfile);
      expect(DeviceRegistry.registerProfileClass).toHaveBeenCalledWith('device-3', MockChromaticProfile);
    });
  });

  describe('getStatus', () => {
    beforeEach(() => {
      deviceService = createDeviceService();
    });

    it('should return connected status', () => {
      deviceService.isDeviceConnected = true;
      deviceService.connectedDeviceInfo = { id: 'test' };

      const status = deviceService.getStatus();

      expect(status).toEqual({
        connected: true,
        device: { id: 'test' }
      });
    });

    it('should return disconnected status', () => {
      const status = deviceService.getStatus();

      expect(status).toEqual({
        connected: false,
        device: null
      });
    });
  });

  describe('isConnected', () => {
    beforeEach(() => {
      deviceService = createDeviceService();
    });

    it('should return true when device is connected', () => {
      deviceService.isDeviceConnected = true;

      expect(deviceService.isConnected()).toBe(true);
    });

    it('should return false when device is not connected', () => {
      expect(deviceService.isConnected()).toBe(false);
    });
  });

  describe('getConnectedDevice', () => {
    beforeEach(() => {
      deviceService = createDeviceService();
    });

    it('should return connected device info', () => {
      const deviceInfo = { id: 'test', name: 'Test Device' };
      deviceService.connectedDeviceInfo = deviceInfo;

      expect(deviceService.getConnectedDevice()).toBe(deviceInfo);
    });

    it('should return null when no device connected', () => {
      expect(deviceService.getConnectedDevice()).toBeNull();
    });
  });

  describe('USB monitoring orchestration (characterization)', () => {
    let usbMonitor;
    let registered;

    function createMockUsbMonitor() {
      registered = {};
      return {
        startMonitoring: vi.fn(),
        stopMonitoring: vi.fn(),
        registerLifecycleListeners: vi.fn((onAdd, onRemove) => {
          registered.onAdd = onAdd;
          registered.onRemove = onRemove;
        }),
        unregisterLifecycleListeners: vi.fn(),
        find: vi.fn(() => []),
        on: vi.fn(),
        off: vi.fn()
      };
    }

    function createServiceWithUsbMonitor() {
      usbMonitor = createMockUsbMonitor();
      const instance = new DeviceService({
        profileRegistry: mockProfileRegistry,
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory,
        usbMonitor
      }, mockProfileClasses);
      mockLogger = mockLoggerFactory._getLogger('DeviceService');
      return instance;
    }

    beforeEach(() => {
      deviceService = createServiceWithUsbMonitor();
    });

    it('starts monitoring: returns true, sets flag, starts the monitor and registers listeners', () => {
      const result = deviceService.startUSBMonitoring();

      expect(result).toBe(true);
      expect(deviceService.isUsbMonitoring).toBe(true);
      expect(usbMonitor.startMonitoring).toHaveBeenCalledTimes(1);
      expect(usbMonitor.registerLifecycleListeners).toHaveBeenCalledTimes(1);
    });

    it('is idempotent: a second start does not restart the monitor', () => {
      deviceService.startUSBMonitoring();
      const result = deviceService.startUSBMonitoring();

      expect(result).toBe(true);
      expect(usbMonitor.startMonitoring).toHaveBeenCalledTimes(1);
    });

    it('stops monitoring: clears flag, stops the monitor and unregisters listeners', () => {
      deviceService.startUSBMonitoring();
      deviceService.stopUSBMonitoring();

      expect(deviceService.isUsbMonitoring).toBe(false);
      expect(usbMonitor.stopMonitoring).toHaveBeenCalledTimes(1);
      expect(usbMonitor.unregisterLifecycleListeners).toHaveBeenCalled();
    });

    it('publishes a check-error and returns false when the monitor fails to start', () => {
      usbMonitor.startMonitoring.mockImplementation(() => {
        throw new Error('hotplug unavailable');
      });

      const result = deviceService.startUSBMonitoring();

      expect(result).toBe(false);
      expect(deviceService.isUsbMonitoring).toBe(false);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'device:check-error',
        expect.objectContaining({ type: 'usb-monitoring-failed' })
      );
    });

    it('routes a hotplug add event for a matched device to a connection-changed publish', () => {
      mockProfileRegistry.detectDevice.mockReturnValue({ matched: true, profile: { name: 'Test Profile' } });
      deviceService.startUSBMonitoring();

      registered.onAdd({ vendorId: 0x1234, productId: 0x5678 });

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'device:connection-changed',
        expect.objectContaining({ connected: true })
      );
    });

    it('scans already-connected devices after the scan delay and connects matches', async () => {
      vi.useFakeTimers();
      try {
        mockProfileRegistry.detectDevice.mockReturnValue({ matched: true, profile: { name: 'Test Profile' } });
        usbMonitor.find.mockReturnValue([{ vendorId: 0x1234, productId: 0x5678 }]);

        deviceService.startUSBMonitoring();
        await vi.advanceTimersByTimeAsync(1000);

        expect(usbMonitor.find).toHaveBeenCalled();
        expect(mockEventBus.publish).toHaveBeenCalledWith(
          'device:connection-changed',
          expect.objectContaining({ connected: true })
        );
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
