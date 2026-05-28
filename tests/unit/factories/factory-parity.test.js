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
