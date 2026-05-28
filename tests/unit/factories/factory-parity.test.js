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
