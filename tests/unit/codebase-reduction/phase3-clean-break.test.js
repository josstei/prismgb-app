import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  getShaderDuplicateStatus
} from '../../../scripts/codebase-size-report.js';
import {
  extractPreloadExposures
} from '../../../scripts/codebase-phase1-drift-report.js';

const projectRoot = process.cwd();

function projectPath(relativePath) {
  return path.join(projectRoot, relativePath);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(projectPath(relativePath), 'utf8');
}

function expectMissing(relativePath) {
  expect(fs.existsSync(projectPath(relativePath))).toBe(false);
}

describe('Phase 3 clean-break consolidation', () => {
  it('keeps stale phase audit artifacts retired after status moved into the implementation plan', () => {
    expectMissing('CODEBASE_SIZE_REDUCTION_PHASE_0_1_AUDIT.md');
    expectMissing('CODEBASE_SIZE_REDUCTION_PHASE_0_3_AUDIT.md');
    expect(readProjectFile('CODEBASE_SIZE_REDUCTION_IMPLEMENTATION_PLAN.md')).toContain(
      'Phase 4 delivered'
    );
    expect(readProjectFile('CODEBASE_SIZE_REDUCTION_IMPLEMENTATION_PLAN.md')).not.toContain(
      'Next phase when resumed: Phase 4'
    );
  });

  it('keeps renderer GPU consolidation package-owned without renderer-private engines or shader trees', () => {
    [
      'src/renderer/infrastructure/rendering/workers/webgpu-renderer.engine.ts',
      'src/renderer/infrastructure/rendering/workers/webgl2-renderer.engine.ts',
      'src/renderer/infrastructure/rendering/workers/optimization.utils.ts',
      'src/renderer/infrastructure/rendering/workers/engine.types.ts',
      'src/renderer/infrastructure/rendering/shaders/webgpu',
      'src/renderer/infrastructure/rendering/shaders/webgl2'
    ].forEach(expectMissing);

    const workerSource = readProjectFile('src/renderer/infrastructure/rendering/workers/render.worker.ts');
    expect(workerSource).toContain("from '@prismgb/gpu'");
    expect(workerSource).toContain('createWorkerPipeline');
    expect(workerSource).not.toMatch(/webgpu-renderer\.engine|webgl2-renderer\.engine|optimization\.utils/);

    const duplicateStatus = getShaderDuplicateStatus(projectRoot);
    expect(duplicateStatus.cleanOwnership).toBe(true);
    expect(duplicateStatus.pairs.map((pair) => pair.status)).toEqual(['package-owned', 'package-owned']);
  });

  it('keeps renderer DI on the Awilix descriptor model without the deleted custom container', () => {
    [
      'src/renderer/infrastructure/di/service-container.factory.ts',
      'tests/unit/renderer/infrastructure/di/service-container.test.js',
      'tests/unit/renderer/infrastructure/di/service-container.types.test.ts'
    ].forEach(expectMissing);

    const containerSource = readProjectFile('src/renderer/application/container.ts');
    expect(containerSource).toContain('@renderer/infrastructure/di/renderer-container.factory.js');
    expect(containerSource).not.toContain('service-container.factory');

    const descriptorSource = readProjectFile('src/renderer/infrastructure/di/renderer-container.factory.ts');
    expect(descriptorSource).toContain('registerRendererDescriptors');
    expect(descriptorSource).toContain('awilix');
  });

  it('does not expose obsolete preload listener cleanup or old public listener names', () => {
    const exposures = extractPreloadExposures(readProjectFile('src/preload/index.js'));
    const exposedMethods = Object.values(exposures).flat();

    expect(exposures.deviceAPI).toEqual([
      'getDeviceStatus',
      'onDeviceConnected',
      'onDeviceDisconnected'
    ]);
    expect(exposures.windowAPI).toEqual([
      'onEnterFullscreen',
      'onLeaveFullscreen',
      'onResized',
      'setFullScreen',
      'isFullScreen'
    ]);
    expect(exposures.updateAPI).toEqual([
      'getStatus',
      'checkForUpdates',
      'downloadUpdate',
      'installUpdate',
      'onAvailable',
      'onNotAvailable',
      'onProgress',
      'onDownloaded',
      'onError'
    ]);
    expect(exposures.transcodeAPI).toEqual([
      'start',
      'cancel',
      'getStatus',
      'onProgress',
      'onCompleted',
      'onError',
      'onCancelled'
    ]);
    expect(exposedMethods).not.toContain('removeListeners');
    expect(exposedMethods).not.toContain('onConnected');
    expect(exposedMethods).not.toContain('onDisconnected');

    const deviceFactorySource = readProjectFile('src/preload/apis/device.preload-api.js');
    expect(deviceFactorySource).not.toMatch(/\bonConnected\b|\bonDisconnected\b/);

    const subscriptionFactorySource = readProjectFile('src/preload/subscription.factory.js');
    expect(subscriptionFactorySource).toContain('createSubscriptionDisposer');
    expect(subscriptionFactorySource).toContain('registryInput instanceof Map');
    expect(subscriptionFactorySource).not.toMatch(/return\s+registry\s*;/);

    [
      'src/preload/apis/device.preload-api.js',
      'src/preload/apis/window.preload-api.js',
      'src/preload/apis/update.preload-api.js',
      'src/preload/apis/transcode.preload-api.js'
    ].forEach((relativePath) => {
      const source = readProjectFile(relativePath);
      expect(source).toContain('createSubscriptionDisposer');
      expect(source).not.toContain('disposeListenersForKey');
      expect(source).not.toContain('listenerKeys');
    });

    const deviceIpcAdapterSource = readProjectFile('src/renderer/infrastructure/adapters/devices/device-ipc.adapter.ts');
    expect(deviceIpcAdapterSource).not.toMatch(/\bonConnected\b|\bonDisconnected\b/);
  });

  it('awaits cleanup ownership instead of fire-and-forget disposal shims', () => {
    const mainIndex = readProjectFile('src/main/index.ts');
    const transcodeSource = readProjectFile('src/main/infrastructure/transcode/transcode.service.ts');
    const renderLoopSource = readProjectFile('src/renderer/infrastructure/services/streaming/canvas-render-loop.service.ts');
    const renderPipelineSource = readProjectFile('src/renderer/infrastructure/services/streaming/render-pipeline.service.ts');
    const rendererContainerSource = readProjectFile('src/renderer/application/container.ts');

    expect(mainIndex).toContain('quitCleanupPromise = application.cleanup()');
    expect(mainIndex).not.toContain('setTimeout(() => {\n          app.quit();');
    expect(transcodeSource).not.toContain("app.on('before-quit'");
    expect(transcodeSource).not.toContain('_cleanupOnQuit');
    expect(renderLoopSource).toContain('async resetCanvasState(): Promise<void>');
    expect(renderLoopSource).toContain('await this._disposePipeline()');
    expect(renderLoopSource).not.toContain('void this._disposePipeline()');
    expect(renderPipelineSource).toContain('async cleanup(): Promise<void>');
    expect(renderPipelineSource).toContain('await this._activeRenderer.cleanup()');
    expect(rendererContainerSource).toContain('async function resetContainer(): Promise<void>');
    expect(rendererContainerSource).toContain('await container.dispose()');
  });

  it('keeps test mocks project-scoped without the deleted lazy/global sandbox helpers', () => {
    [
      'tests/utils/global-sandbox.js',
      'tests/utils/lazy-mocks.js'
    ].forEach(expectMissing);

    const sharedSetup = readProjectFile('tests/setup.js');
    expect(sharedSetup).not.toMatch(/stubGlobal|mediaDevices|requestAnimationFrame|HTMLCanvasElement/);

    const vitestConfig = readProjectFile('vitest.config.js');
    expect(vitestConfig).toContain("name: 'shared-node'");
    expect(vitestConfig).toContain("name: 'renderer-happy-dom'");
    expect(vitestConfig).toContain("name: 'main-preload'");
    expect(vitestConfig).toContain("name: 'gpu-package'");
    expect(vitestConfig).toContain('tests/support/mocks/node-browser-mocks.setup.js');
    expect(vitestConfig).toContain('tests/support/mocks/renderer-browser-mocks.setup.js');
  });
});
