import { describe, it, expect } from 'vitest';
import * as Barrel from '../../factories/index.js';

describe('factory barrel parity', () => {
  const expectedSymbols = [
    'createEventBus',
    'createContractValidatingEventBus',
    'createLogger',
    'createLoggerFactory',
    'LogLevels',
    'createDeviceInfo',
    'createVideoTrack',
    'createMediaStream',
    'createDeviceAdapter',
    'createDeviceService',
    'createAdapterFactory',
    'AdapterState',
    'createStreamingService',
    'createRenderPipeline',
    'createMockCanvas',
    'createMockVideo',
    'StreamingState',
    'createStorageService',
    'createAppState',
    'createStreamingAppState',
    'createRecordingAppState',
    'DEFAULT_STATE',
    'createMockElement',
    'createMockButton',
    'createMockInput',
    'createUIController',
    'createCaptureEffects',
    'createButtonFeedback',
    'createDeviceStatusElementsMock',
    'createNotesPanelElementsMock',
    'createShaderSelectorElementsMock',
    'createSettingsMenuElementsMock',
    'createStatusNotificationElementsMock',
    'createTranscodeToastElementsMock',
    'CHROMATIC_SPECS',
    'createMockVideoTrack',
    'createMockStream',
    'createMockDeviceInfo',
    'MockDevice',
    'MockDeviceManager',
    'DeviceState',
    'MockDeviceStateMachine',
    'createChromaticWithFSM',
    'createMockUIController',
    'performanceUtils',
  ];

  it.each(expectedSymbols)('exports %s', (name) => {
    expect(Barrel[name]).toBeDefined();
  });
});

import * as SystemFactory from '../../factories/system.factory.js';

describe('system.factory.js', () => {
  const expected = [
    'createDisposableMock',
    'createContextBridgeMock',
    'createProcessMetricsApiMock',
    'createOffscreenCanvasElementMock',
    'createCallbackMap',
    'createPreloadEventApiMock',
    'createMediaQueryListMock',
    'createCanvasRenderingContextMock',
    'createBitmapMock',
    'createPreventDefaultEventMock',
    'createDomEventMock',
    'createWinstonLoggerMock',
    'createWinstonRootLoggerMock',
    'createShellServiceMock',
    'createLoginItemServiceMock',
  ];

  it.each(expected)('module exports %s', (name) => {
    expect(SystemFactory[name]).toBeTypeOf('function');
  });

  it.each(expected)('barrel re-exports %s', (name) => {
    expect(Barrel[name]).toBe(SystemFactory[name]);
  });
});

import * as SettingsFactory from '../../factories/settings.factory.js';

describe('settings.factory.js', () => {
  const expected = [
    'createSettingsServiceHarness',
    'createSettingsServiceMock',
    'createNotesServiceMock',
    'createSettingsFullscreenServiceMock',
    'createSettingsCinematicModeServiceMock',
    'createPresentationModeServiceMock',
  ];

  it.each(expected)('module exports %s', (name) => {
    expect(SettingsFactory[name]).toBeTypeOf('function');
  });

  it.each(expected)('barrel re-exports %s', (name) => {
    expect(Barrel[name]).toBe(SettingsFactory[name]);
  });
});

import * as UpdateFactory from '../../factories/update.factory.js';

describe('update.factory.js', () => {
  const expected = [
    'createUpdateConfigMock',
    'createUpdateServiceMock',
    'createUpdateUiServiceMock',
  ];

  it.each(expected)('module exports %s', (name) => {
    expect(UpdateFactory[name]).toBeTypeOf('function');
  });

  it.each(expected)('barrel re-exports %s', (name) => {
    expect(Barrel[name]).toBe(UpdateFactory[name]);
  });
});

import * as WindowFactory from '../../factories/window.factory.js';

describe('window.factory.js', () => {
  const expected = [
    'createWindowServiceMock',
    'createBrowserWindowMock',
    'createWindowServiceElectronMock',
    'createTrayMock',
    'createTrayServiceElectronMock',
  ];

  it.each(expected)('module exports %s', (name) => {
    expect(WindowFactory[name]).toBeTypeOf('function');
  });

  it.each(expected)('barrel re-exports %s', (name) => {
    expect(Barrel[name]).toBe(WindowFactory[name]);
  });
});

import * as PerformanceFactory from '../../factories/performance.factory.js';

describe('performance.factory.js', () => {
  const expected = [
    'createPerformanceMetricsAdapterMock',
    'createVisibilityAdapterMock',
    'createUserActivityAdapterMock',
    'createReducedMotionAdapterMock',
    'createPerformanceStateServiceMock',
    'createPerformanceMetricsServiceMock',
    'createPerformanceAnimationServiceMock',
    'createBodyClassManagerMock',
    'createProcessMetricsMock',
    'createAppMetricsServiceMock',
  ];

  it.each(expected)('module exports %s', (name) => {
    expect(PerformanceFactory[name]).toBeTypeOf('function');
  });

  it.each(expected)('barrel re-exports %s', (name) => {
    expect(Barrel[name]).toBe(PerformanceFactory[name]);
  });
});

import * as DeviceFactory from '../../factories/device.factory.js';

describe('device.factory.js extensions', () => {
  const expected = [
    'createDeviceServiceMock',
    'createProfileRegistryMock',
    'createDeviceStatusProviderMock',
    'createDeviceStatusMock',
    'createDeviceChangeDebounceAdapterMock',
    'createDeviceStatusComponentMock',
    'createIpcClientMock',
    'createDeviceIpcAdapterMock',
    'createDeviceOperationSequencerMock',
  ];

  it.each(expected)('module exports %s', (name) => {
    expect(DeviceFactory[name]).toBeTypeOf('function');
  });

  it.each(expected)('barrel re-exports %s', (name) => {
    expect(Barrel[name]).toBe(DeviceFactory[name]);
  });
});

import * as StreamFactory from '../../factories/stream.factory.js';

describe('stream.factory.js extensions', () => {
  const expected = [
    'createStreamPayloadMock',
    'createMediaTrackMock',
    'createMediaStreamMock',
    'createCaptureStreamMock',
    'createStreamCapabilitiesMock',
    'createStreamConstraintsMock',
    'createAcquisitionContextMock',
    'createConstraintBuilderContextMock',
    'createConstraintBuilderMock',
    'createSupportedDevicePayloadMock',
    'createStreamStartedPayloadMock',
    'createBrowserMediaServiceMock',
    'createMediaServiceMock',
    'createStreamingAdapterMock',
    'createStreamingAdapterRegistryMock',
  ];

  it.each(expected)('module exports %s', (name) => {
    expect(StreamFactory[name]).toBeTypeOf('function');
  });

  it.each(expected)('barrel re-exports %s', (name) => {
    expect(Barrel[name]).toBe(StreamFactory[name]);
  });
});
