// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  createRendererContainer,
  initializeContainer
} from '@renderer/application/container';

const expectedRegistrationKeys = [
  'eventBus',
  'loggerFactory',
  'storageService',
  'browserMediaService',
  'visibilityAdapter',
  'userActivityAdapter',
  'reducedMotionAdapter',
  'metricsAdapter',
  'deviceIpcAdapter',
  'deviceChangeDebounceAdapter',
  'animationCache',
  'canvasRenderLoopService',
  'viewportService',
  'canvasLifecycleService',
  'gpuRenderLoopService',
  'streamHealthService',
  'gpuFrameBuffer',
  'gpuWorkerManager',
  'gpuRendererService',
  'streamingRendererFactory',
  'renderPipelineService',
  'ipcClient',
  'deviceStatusProvider',
  'adapterFactory',
  'deviceStorageService',
  'deviceConnectionService',
  'deviceMediaService',
  'deviceService',
  'deviceOperationSequencer',
  'streamingService',
  'captureService',
  'gpuRecordingService',
  'transcodeService',
  'captureSaveService',
  'settingsService',
  'notesService',
  'updateService',
  'updateUiService',
  'streamViewService',
  'streamingAudioPipelineService',
  'appState',
  'uiComponentRegistry',
  'uiEffects',
  'bodyClassManager',
  'uiEventBridge',
  'presentationModeService',
  'captureUiBridge',
  'transcodeUiBridge',
  'deviceOrchestrator',
  'streamingAudioOrchestrator',
  'streamingOrchestrator',
  'captureOrchestrator',
  'preferencesOrchestrator',
  'fullscreenService',
  'cinematicModeService',
  'displayModeOrchestrator',
  'updateOrchestrator',
  'performanceStateOrchestrator',
  'animationPerformanceOrchestrator',
  'performanceMetricsService',
  'performanceStateService',
  'animationPerformanceService',
  'performanceMetricsOrchestrator',
  'uiSetupOrchestrator',
  'appOrchestrator'
];

describe('Renderer container', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates renderer container with expected descriptor registrations', () => {
    const container = createRendererContainer();

    const tokens = container.tokens;

    expect(tokens).toEqual(expect.arrayContaining(expectedRegistrationKeys));
    expect(tokens).not.toContain('uiController');
    expect(container.resolve('loggerFactory')).toBeDefined();
  });

  it('resolves UI effects without requiring a container-level elements token', () => {
    const container = createRendererContainer();

    const uiEffects = container.resolve('uiEffects');

    expect(uiEffects.elements).toBeNull();
    expect(container.tokens).not.toContain('elements');
  });

  it('warns and reuses container on repeated initialization', () => {
    const warnSpy = vi.spyOn(console, 'warn');
    const first = initializeContainer();
    const second = initializeContainer();

    expect(first).toBe(second);
    expect(warnSpy).toHaveBeenCalledWith('Container already initialized');
  });

  it('resolves UI-bound services once uiController is registered', () => {
    const container = createRendererContainer();

    container.registerValue('uiController', {
      initializeComponents: () => {},
      dispose: () => {}
    });

    expect(() => container.resolve('uiSetupOrchestrator')).not.toThrow();
  });

  it('still resolves app orchestration after uiController registration', () => {
    const container = createRendererContainer();

    container.registerValue('uiController', {
      initializeComponents: () => {},
      elements: {},
      dispose: () => {}
    });

    expect(() => container.resolve('appOrchestrator')).not.toThrow();
  });

  it('resolves manual-provider and standard service tokens with chained dependencies', () => {
    const container = createRendererContainer();

    // Manual providers, including chained resolution (deviceStatusProvider -> ipcClient,
    // canvasRenderLoopService -> animationCache).
    expect(() => container.resolve('storageService')).not.toThrow();
    expect(() => container.resolve('ipcClient')).not.toThrow();
    expect(() => container.resolve('deviceStatusProvider')).not.toThrow();
    expect(() => container.resolve('canvasRenderLoopService')).not.toThrow();

    // Standard service registrations: cradle construction and no-arg construction.
    expect(container.resolve('gpuFrameBuffer')).toBeDefined();
    expect(container.resolve('animationCache')).toBeDefined();
  });
});
