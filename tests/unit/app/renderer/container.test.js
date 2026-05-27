import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  asValue,
  createRendererContainer,
  getContainer,
  initializeContainer,
  resetContainer
} from '@renderer/application/container.ts';
import { clearPreloadApi, createPreloadApiMock, setPreloadApi } from '../../../support/mocks/preload-api-globals.js';

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
    setPreloadApi('deviceAPI', createPreloadApiMock('deviceAPI'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await resetContainer();
    clearPreloadApi('deviceAPI');
  });

  it('creates renderer container with expected descriptor registrations', () => {
    const container = createRendererContainer();

    const tokens = Object.keys(container.registrations);

    expect(tokens).toEqual(expect.arrayContaining(expectedRegistrationKeys));
    expect(tokens).not.toContain('uiController');
    expect(container.resolve('loggerFactory')).toBeDefined();
  });

  it('resolves UI effects without requiring a container-level elements token', () => {
    const container = createRendererContainer();

    const uiEffects = container.resolve('uiEffects');

    expect(uiEffects.elements).toBeNull();
    expect(Object.keys(container.registrations)).not.toContain('elements');
  });

  it('warns and reuses container on repeated initialization', () => {
    const warnSpy = vi.spyOn(console, 'warn');
    const first = initializeContainer();
    const second = initializeContainer();

    expect(first).toBe(second);
    expect(warnSpy).toHaveBeenCalledWith('Container already initialized');
  });

  it('returns the active container', () => {
    const container = initializeContainer();
    expect(getContainer()).toBe(container);
  });

  it('throws if container is accessed before initialization', () => {
    expect(() => getContainer()).toThrow('Container not initialized. Call initializeContainer() first.');
  });

  it('disposes and clears container state on reset', async () => {
    const container = initializeContainer();
    const disposeSpy = vi.spyOn(container, 'dispose');
    await resetContainer();

    expect(disposeSpy).toHaveBeenCalled();
    expect(() => getContainer()).toThrow('Container not initialized. Call initializeContainer() first.');
  });

  it('requires uiController registration for UI-bound services', () => {
    const container = createRendererContainer();

    expect(() => container.resolve('uiSetupOrchestrator')).toThrow();

    container.register({
      uiController: asValue({
        initializeComponents: () => {},
        dispose: () => {}
      })
    });

    expect(() => container.resolve('uiSetupOrchestrator')).not.toThrow();
  });

  it('still resolves app orchestration after uiController registration', () => {
    const container = createRendererContainer();

    container.register({
      uiController: asValue({
        initializeComponents: () => {},
        elements: {},
        dispose: () => {}
      })
    });

    expect(() => container.resolve('appOrchestrator')).not.toThrow();
  });
});
