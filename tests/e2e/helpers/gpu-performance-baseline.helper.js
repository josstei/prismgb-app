import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const REQUIRED_VARIANTS = Object.freeze([
  ['production', false, false],
  ['harness-control', true, false],
  ['instrumented', true, true]
]);

const PRODUCTION_FORBIDDEN_SENTINELS = Object.freeze([
  'prismgb.performance',
  'prismgbPerformanceLaunchMarker',
  'prismgbPerformanceControlProbe',
  'performance-shutdown-boundary',
  'shutdown-boundary',
  'frameToken',
  'canvas-draw-completed',
  'webgpu-queue-submit-completed',
  'adapter-unavailable',
  'performance-diagnostics',
  'prismgb-e2e-diagnostics',
  'PRISMGB_E2E_DIAGNOSTICS'
]);

const PERFORMANCE_CONTROL_PROBE_SYMBOL = 'prismgb.performance.controlProbe';
const PERFORMANCE_CALLBACK_GATE_SYMBOL = 'prismgb.performance.callbackGate';
const PERFORMANCE_EXTERNAL_SENTINEL_GATE_SYMBOL = 'prismgb.performance.externalSentinelGate';
const PERFORMANCE_RENDERER_DIAGNOSTICS_SYMBOL = 'prismgb.performance.rendererDiagnostics';

function fail(message) {
  throw new Error(`GPU performance baseline helper failed: ${message}`);
}

function compareCodeUnitStrings(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

async function walkFiles(root, directory = root) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => compareCodeUnitStrings(left.name, right.name))) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(root, absolutePath));
      continue;
    }
    if (entry.isFile()) files.push(absolutePath);
  }
  return files;
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || manifest.schemaVersion !== 1) {
    fail('build manifest is malformed');
  }
  if (!/^[a-f0-9]{40}$/i.test(manifest.sourceSha)) fail('build manifest source SHA is malformed');
  if (!Array.isArray(manifest.variants) || manifest.variants.length !== REQUIRED_VARIANTS.length) {
    fail('build manifest must contain exactly three variants');
  }
  for (const [index, [id, harness, instrumentation]] of REQUIRED_VARIANTS.entries()) {
    const variant = manifest.variants[index];
    if (!variant || variant.id !== id || variant.harness !== harness || variant.instrumentation !== instrumentation) {
      fail(`build manifest variant ${id} is malformed`);
    }
    if (!variant.bundle || !/^[a-f0-9]{64}$/i.test(variant.bundle.sha256) || !Array.isArray(variant.bundle.entries)) {
      fail(`build manifest variant ${id} has no canonical bundle`);
    }
  }
}

export function createPerformanceLaunchId() {
  return crypto.randomUUID();
}

export function createExternalPerformanceExecutionId() {
  return crypto.randomUUID();
}

export async function loadPerformanceBuildManifest(manifestPath = process.env.PRISMGB_PERFORMANCE_BUILD_MANIFEST) {
  if (typeof manifestPath !== 'string' || manifestPath.length === 0) {
    fail('PRISMGB_PERFORMANCE_BUILD_MANIFEST is required');
  }
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  validateManifest(manifest);
  return Object.freeze({
    manifest: Object.freeze(manifest),
    manifestPath: path.resolve(manifestPath),
    buildsDirectory: path.join(path.dirname(path.resolve(manifestPath)), 'builds')
  });
}

export function getPerformanceBuild(loadedManifest, variantId) {
  const variant = loadedManifest.manifest.variants.find((entry) => entry.id === variantId);
  if (!variant) fail(`unknown build variant ${variantId}`);
  return Object.freeze({
    ...variant,
    directory: path.join(loadedManifest.buildsDirectory, variant.id)
  });
}

export async function assertProductionBundleIsolation(loadedManifest) {
  const production = getPerformanceBuild(loadedManifest, 'production');
  const files = await walkFiles(production.directory);
  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    for (const sentinel of PRODUCTION_FORBIDDEN_SENTINELS) {
      if (content.includes(sentinel)) {
        fail(`production bundle ${path.relative(production.directory, file)} contains ${sentinel}`);
      }
    }
  }
}

export async function assertPerformanceController(electronApp, launchId) {
  return electronApp.evaluate((_electron, expectedLaunchId) => {
    const controller = globalThis[Symbol.for('prismgb.performance.measurementController')];
    if (!controller || typeof controller.assertLaunchId !== 'function') {
      throw new Error('measurement controller is not installed');
    }
    controller.assertLaunchId(expectedLaunchId);
    return { mainPid: process.pid };
  }, launchId);
}

export async function installPerformanceControlProbe(page, launchId) {
  await page.evaluate(({ launchId: expectedLaunchId, probeSymbol }) => {
    const writes = [];
    const sourceSequences = new Set();
    let lastSourceSequence = 0;
    const marker = window.prismgbPerformanceLaunchMarker;
    if (marker?.launchId !== expectedLaunchId) {
      throw new Error('cannot install a control probe without the validated renderer marker');
    }
    if (window.prismgbPerformanceControlProbe !== undefined) {
      throw new Error('performance control probe is already installed');
    }

    Object.defineProperty(window, 'prismgbPerformanceControlProbe', {
      configurable: true,
      enumerable: false,
      writable: false,
      value: Object.freeze({
        write(message) {
          if (!message || message.launchId !== expectedLaunchId) {
            throw new Error('performance control probe received an invalid boundary message');
          }
          if (message.kind === 'source-opportunity') {
            if (
              !Number.isSafeInteger(message.sourceSequence) ||
              message.sourceSequence !== lastSourceSequence + 1 ||
              !(message.mediaTime === null || (typeof message.mediaTime === 'number' && Number.isFinite(message.mediaTime))) ||
              typeof message.sessionPresent !== 'boolean' ||
              typeof message.sessionActive !== 'boolean' ||
              typeof message.duplicateMediaTime !== 'boolean' ||
              !Number.isSafeInteger(message.readyState) ||
              message.readyState < 0 ||
              typeof message.hasCurrentData !== 'boolean'
            ) {
              throw new Error('performance control probe received invalid source evidence');
            }
            lastSourceSequence = message.sourceSequence;
            sourceSequences.add(message.sourceSequence);
          } else if (message.kind === 'advisory-frame-disposition') {
            if (
              !sourceSequences.has(message.sourceSequence) ||
              ![null, 'canvas-draw-completed', 'webgpu-queue-submit-completed', 'skipped-inactive', 'failed']
                .includes(message.outcome) ||
              !(message.frameToken === null || (Number.isSafeInteger(message.frameToken) && message.frameToken > 0))
            ) {
              throw new Error('performance control probe received invalid advisory disposition');
            }
          } else if (message.kind === 'frame-branch') {
            if (!sourceSequences.has(message.sourceSequence)) {
              throw new Error('performance control probe received a branch without a source opportunity');
            }
            if (message.branch === 'canvas-disposition') {
              if (!['canvas-draw-completed', 'webgpu-queue-submit-completed', 'skipped-inactive', 'failed'].includes(message.outcome)) {
                throw new Error('performance control probe received an invalid Canvas branch outcome');
              }
            } else if (message.branch === 'bitmap-creation') {
              if (message.outcome !== 'created' && message.outcome !== 'failed') {
                throw new Error('performance control probe received an invalid bitmap branch outcome');
              }
            } else if (message.branch === 'worker-frame-submitted' || message.branch === 'worker-terminal-error') {
              if (!Number.isSafeInteger(message.frameToken) || message.frameToken <= 0) {
                throw new Error('performance control probe received an invalid worker frame token');
              }
            } else if (message.branch === 'worker-frame-acknowledged') {
              if (
                !Number.isSafeInteger(message.frameToken) ||
                message.frameToken <= 0 ||
                !['canvas-draw-completed', 'webgpu-queue-submit-completed', 'skipped-inactive', 'failed']
                  .includes(message.outcome)
              ) {
                throw new Error('performance control probe received an invalid worker acknowledgement');
              }
            } else if (
              message.branch !== 'session-disposition' ||
              ![
                'session-inactive',
                'worker-not-ready',
                'backpressure',
                'no-current-data',
                'bitmap-creation-failed',
                'enqueue-failed'
              ].includes(message.disposition)
            ) {
              throw new Error('performance control probe received an invalid session branch');
            }
          } else if (
            message.kind !== 'shutdown-boundary' ||
            (message.boundary !== 'before-release' && message.boundary !== 'release-dispatched')
          ) {
            throw new Error('performance control probe received an invalid boundary message');
          }
          writes.push(Object.freeze({ ...message, observedAt: performance.now() }));
        }
      })
    });

    Object.defineProperty(window, Symbol.for(probeSymbol), {
      configurable: true,
      enumerable: false,
      writable: false,
      value: (command = 'snapshot') => {
        if (command === 'snapshot') {
          return writes.map((write) => ({ ...write }));
        }
        if (command === 'reset') {
          writes.length = 0;
          sourceSequences.clear();
          return Object.freeze({ reset: true });
        }
        throw new Error('performance control probe command is unsupported');
      }
    });
  }, { launchId, probeSymbol: PERFORMANCE_CONTROL_PROBE_SYMBOL });
}

async function installManagedPerformanceCallbackGate(page, {
  authorityId,
  expectedMarkerLaunchId = null,
  gateSymbol,
  requireObservationReset = false
} = {}) {
  if (typeof authorityId !== 'string' || authorityId.length === 0) {
    fail('performance callback gate authority ID is required');
  }
  if (!(expectedMarkerLaunchId === null || (typeof expectedMarkerLaunchId === 'string' && expectedMarkerLaunchId.length > 0))) {
    fail('performance callback gate marker authority is invalid');
  }
  if (typeof gateSymbol !== 'string' || gateSymbol.length === 0) {
    fail('performance callback gate symbol is required');
  }

  await page.evaluate(({
    authorityId: expectedAuthorityId,
    expectedMarkerLaunchId: expectedMarker,
    gateSymbol: expectedGateSymbol,
    requireObservationReset: requireReset
  }) => {
    if (expectedMarker !== null) {
      const marker = window.prismgbPerformanceLaunchMarker;
      if (marker?.launchId !== expectedMarker) {
        throw new Error('cannot install a callback gate without the validated renderer marker');
      }
    }

    const gateKey = Symbol.for(expectedGateSymbol);
    if (window[gateKey] !== undefined) {
      throw new Error('performance callback gate is already installed');
    }

    const videoPrototype = HTMLVideoElement.prototype;
    const requestDescriptor = Object.getOwnPropertyDescriptor(videoPrototype, 'requestVideoFrameCallback');
    if (!requestDescriptor || typeof requestDescriptor.value !== 'function') {
      throw new Error('performance callback gate requires requestVideoFrameCallback');
    }
    const cancelDescriptor = Object.getOwnPropertyDescriptor(videoPrototype, 'cancelVideoFrameCallback');
    const originalRequest = requestDescriptor.value;
    const originalCancel = cancelDescriptor?.value;

    const canvasPrototype = CanvasRenderingContext2D.prototype;
    const drawImageDescriptor = Object.getOwnPropertyDescriptor(canvasPrototype, 'drawImage');
    if (!drawImageDescriptor || typeof drawImageDescriptor.value !== 'function') {
      throw new Error('performance callback gate requires CanvasRenderingContext2D.drawImage');
    }
    const originalDrawImage = drawImageDescriptor.value;

    const originalWorker = window.Worker;
    const workerOwnDescriptor = Object.getOwnPropertyDescriptor(window, 'Worker');
    if (typeof originalWorker !== 'function' || (workerOwnDescriptor && !workerOwnDescriptor.configurable)) {
      throw new Error('performance callback gate requires a replaceable Worker constructor');
    }

    const heldCallbacks = new Map();
    const workerPatches = new Map();
    const callbackObservations = [];
    const canvasDrawObservations = [];
    const workerFramePostObservations = [];
    const acknowledgementObservations = [];
    const errorObservations = [];
    let paused = false;
    let pauseAtCallbackCount = null;
    let interceptedCallbackCount = 0;
    let measurementWindow = null;
    let observationsReset = !requireReset;
    let observationSequence = 0;
    let postPauseCanvasDrawCount = 0;
    let videoPatched = false;
    let cancelPatched = false;
    let canvasPatched = false;
    let workerPatched = false;

    const isRecord = (value) => value !== null && typeof value === 'object';
    const isWindowRunning = () => measurementWindow?.status === 'running';
    const isWindowOpenOrClosed = () => measurementWindow?.status === 'running' || measurementWindow?.status === 'closed';
    const nextObservation = (kind, details = {}) => ({
      sequence: ++observationSequence,
      kind,
      observedAt: performance.now(),
      ...details
    });
    const cloneRows = (rows) => rows.map((row) => ({ ...row }));
    const resetObservations = () => {
      callbackObservations.length = 0;
      canvasDrawObservations.length = 0;
      workerFramePostObservations.length = 0;
      acknowledgementObservations.length = 0;
      errorObservations.length = 0;
      observationSequence = 0;
      postPauseCanvasDrawCount = 0;
      observationsReset = true;
    };
    const snapshot = () => {
      const acknowledgementCount = acknowledgementObservations.length;
      const outstandingWorkerFrames = workerFramePostObservations.length - acknowledgementCount - errorObservations.length;
      return {
        paused,
        heldCallbackCount: heldCallbacks.size,
        interceptedCallbackCount,
        pauseAtCallbackCount,
        measurementWindow: measurementWindow === null ? null : { ...measurementWindow },
        observations: {
          callbacks: cloneRows(callbackObservations),
          canvasDraws: cloneRows(canvasDrawObservations),
          workerFramePosts: cloneRows(workerFramePostObservations),
          acknowledgements: cloneRows(acknowledgementObservations),
          errors: cloneRows(errorObservations),
          postPauseCanvasDrawCount,
          outstandingWorkerFrames
        }
      };
    };
    const assertAuthorityId = (requestedAuthorityId) => {
      if (requestedAuthorityId !== expectedAuthorityId) {
        throw new Error('performance callback gate authority ID does not match the installed gate');
      }
    };
    const holdCallback = (frameCallbackHandle, video, callback, now, metadata) => {
      heldCallbacks.set(frameCallbackHandle, { video, callback, now, metadata });
    };
    const closeMeasurementWindowIfReady = (observedAt) => {
      if (measurementWindow?.status !== 'running' || measurementWindow.startedAt === null) {
        return false;
      }

      const elapsedMs = observedAt - measurementWindow.startedAt;
      if (
        measurementWindow.deliveredCallbackCount >= measurementWindow.minimumCallbacks &&
        elapsedMs >= measurementWindow.minimumDurationMs
      ) {
        measurementWindow.status = 'closed';
        measurementWindow.closedAt = observedAt;
        measurementWindow.closureReason = 'minimum-reached';
        return true;
      }

      if (
        measurementWindow.deliveredCallbackCount >= measurementWindow.maximumCallbacks ||
        elapsedMs >= measurementWindow.maximumDurationMs
      ) {
        measurementWindow.status = 'failed';
        measurementWindow.closedAt = observedAt;
        measurementWindow.closureReason = measurementWindow.deliveredCallbackCount >= measurementWindow.maximumCallbacks
          ? 'callback-cap-reached'
          : 'duration-cap-reached';
        return true;
      }

      return false;
    };
    const invokeCallback = ({ video, callback, now, metadata }) => {
      if (isWindowRunning()) {
        measurementWindow.deliveredCallbackCount += 1;
        callbackObservations.push(nextObservation('renderer-callback', {
          callbackOrdinal: measurementWindow.deliveredCallbackCount,
          mediaTime: Number.isFinite(metadata?.mediaTime) ? metadata.mediaTime : null
        }));
      }
      return callback.call(video, now, metadata);
    };
    const observeWorkerMessage = (data) => {
      if (!isWindowOpenOrClosed() || !isRecord(data)) return;
      if (data.type === 'frameRendered') {
        const payload = data.payload;
        const tagged = isRecord(payload) && Number.isSafeInteger(payload.frameToken) && payload.frameToken > 0;
        acknowledgementObservations.push(nextObservation('worker-frame-acknowledged', { tagged }));
      } else if (data.type === 'error') {
        errorObservations.push(nextObservation('worker-message-error'));
      }
    };
    const observeWorkerError = () => {
      if (isWindowOpenOrClosed()) {
        errorObservations.push(nextObservation('worker-error-event'));
      }
    };
    const instrumentWorker = (worker) => {
      if (workerPatches.has(worker)) return;
      const originalPostMessage = worker.postMessage;
      if (typeof originalPostMessage !== 'function') {
        throw new Error('performance callback gate requires Worker.postMessage');
      }
      const ownPostMessageDescriptor = Object.getOwnPropertyDescriptor(worker, 'postMessage');
      const messageListener = (event) => observeWorkerMessage(event.data);
      const errorListener = () => observeWorkerError();
      worker.addEventListener('message', messageListener);
      worker.addEventListener('error', errorListener);
      try {
        Object.defineProperty(worker, 'postMessage', {
          configurable: true,
          enumerable: ownPostMessageDescriptor?.enumerable ?? false,
          writable: true,
          value: function patchedWorkerPostMessage(message, ...args) {
            if (isWindowRunning() && isRecord(message) && message.type === 'frame') {
              workerFramePostObservations.push(nextObservation('worker-frame-posted'));
            }
            return Reflect.apply(originalPostMessage, this, [message, ...args]);
          }
        });
      } catch (error) {
        worker.removeEventListener('message', messageListener);
        worker.removeEventListener('error', errorListener);
        throw error;
      }
      workerPatches.set(worker, { ownPostMessageDescriptor, messageListener, errorListener });
    };

    let observedWorker;
    observedWorker = new Proxy(originalWorker, {
      construct(target, args, newTarget) {
        const worker = Reflect.construct(target, args, newTarget === observedWorker ? target : newTarget);
        instrumentWorker(worker);
        return worker;
      }
    });

    const restorePatches = () => {
      const restorationErrors = [];
      const attemptRestore = (restore) => {
        try {
          restore();
        } catch (error) {
          restorationErrors.push(error instanceof Error ? error.message : String(error));
        }
      };
      for (const [worker, patch] of workerPatches) {
        attemptRestore(() => worker.removeEventListener('message', patch.messageListener));
        attemptRestore(() => worker.removeEventListener('error', patch.errorListener));
        attemptRestore(() => {
          if (patch.ownPostMessageDescriptor) {
            Object.defineProperty(worker, 'postMessage', patch.ownPostMessageDescriptor);
          } else {
            delete worker.postMessage;
          }
        });
      }
      workerPatches.clear();
      if (workerPatched) {
        attemptRestore(() => {
          if (workerOwnDescriptor) {
            Object.defineProperty(window, 'Worker', workerOwnDescriptor);
          } else {
            delete window.Worker;
          }
        });
        workerPatched = false;
      }
      if (canvasPatched) {
        attemptRestore(() => Object.defineProperty(canvasPrototype, 'drawImage', drawImageDescriptor));
        canvasPatched = false;
      }
      if (cancelPatched && cancelDescriptor) {
        attemptRestore(() => Object.defineProperty(videoPrototype, 'cancelVideoFrameCallback', cancelDescriptor));
        cancelPatched = false;
      }
      if (videoPatched) {
        attemptRestore(() => Object.defineProperty(videoPrototype, 'requestVideoFrameCallback', requestDescriptor));
        videoPatched = false;
      }
      if (restorationErrors.length > 0) {
        throw new Error('performance callback gate could not restore every external patch: ' + restorationErrors.join('; '));
      }
    };

    try {
      Object.defineProperty(videoPrototype, 'requestVideoFrameCallback', {
        ...requestDescriptor,
        value: function patchedRequestVideoFrameCallback(callback) {
          const video = this;
          let frameCallbackHandle;
          const wrappedCallback = (now, metadata) => {
            interceptedCallbackCount++;
            const observedAt = performance.now();
            if (closeMeasurementWindowIfReady(observedAt)) {
              paused = true;
              pauseAtCallbackCount = null;
              holdCallback(frameCallbackHandle, video, callback, now, metadata);
              return;
            }
            if (paused || (pauseAtCallbackCount !== null && interceptedCallbackCount >= pauseAtCallbackCount)) {
              paused = true;
              pauseAtCallbackCount = null;
              holdCallback(frameCallbackHandle, video, callback, now, metadata);
              return;
            }
            return invokeCallback({ video, callback, now, metadata });
          };
          frameCallbackHandle = Reflect.apply(originalRequest, video, [wrappedCallback]);
          return frameCallbackHandle;
        }
      });
      videoPatched = true;

      if (cancelDescriptor && typeof originalCancel === 'function') {
        Object.defineProperty(videoPrototype, 'cancelVideoFrameCallback', {
          ...cancelDescriptor,
          value: function patchedCancelVideoFrameCallback(frameCallbackHandle) {
            heldCallbacks.delete(frameCallbackHandle);
            return Reflect.apply(originalCancel, this, [frameCallbackHandle]);
          }
        });
        cancelPatched = true;
      }

      Object.defineProperty(canvasPrototype, 'drawImage', {
        ...drawImageDescriptor,
        value: function patchedCanvasDrawImage(...args) {
          const result = Reflect.apply(originalDrawImage, this, args);
          if (this.canvas?.id === 'streamCanvas') {
            if (isWindowRunning()) {
              canvasDrawObservations.push(nextObservation('canvas-draw-completed'));
            } else if (paused && measurementWindow?.status === 'closed') {
              postPauseCanvasDrawCount += 1;
            }
          }
          return result;
        }
      });
      canvasPatched = true;

      Object.defineProperty(window, 'Worker', {
        configurable: true,
        enumerable: workerOwnDescriptor?.enumerable ?? true,
        writable: true,
        value: observedWorker
      });
      workerPatched = true;
    } catch (error) {
      try {
        restorePatches();
      } catch {
        // The original installation failure is the actionable error.
      }
      throw error;
    }

    Object.defineProperty(window, gateKey, {
      configurable: true,
      enumerable: false,
      writable: false,
      value: Object.freeze({
        pause(requestedAuthorityId) {
          assertAuthorityId(requestedAuthorityId);
          if (measurementWindow?.status === 'running') {
            throw new Error('performance callback gate cannot pause an active measurement window');
          }
          paused = true;
          pauseAtCallbackCount = null;
          return snapshot();
        },
        pauseAt(requestedAuthorityId, requestedCallbackCount) {
          assertAuthorityId(requestedAuthorityId);
          if (measurementWindow?.status === 'running') {
            throw new Error('performance callback gate cannot set a pause target during an active measurement window');
          }
          if (!Number.isSafeInteger(requestedCallbackCount) || requestedCallbackCount <= interceptedCallbackCount) {
            throw new Error('performance callback gate pause target must be a future callback count');
          }
          pauseAtCallbackCount = requestedCallbackCount;
          return snapshot();
        },
        reset(requestedAuthorityId) {
          assertAuthorityId(requestedAuthorityId);
          if (!paused || heldCallbacks.size !== 1 || measurementWindow !== null) {
            throw new Error('performance callback gate requires one held callback before resetting external observations');
          }
          resetObservations();
          return snapshot();
        },
        armWindow(requestedAuthorityId, limits) {
          assertAuthorityId(requestedAuthorityId);
          if (!paused || heldCallbacks.size !== 1) {
            throw new Error('performance callback gate requires exactly one held callback before arming a measurement window');
          }
          if (measurementWindow !== null) {
            throw new Error('performance callback gate measurement window is already armed');
          }
          if (requireReset && !observationsReset) {
            throw new Error('external performance sentinel requires a reset before arming its measurement window');
          }
          if (!limits || typeof limits !== 'object') {
            throw new Error('performance callback gate measurement window limits are required');
          }
          const {
            minimumCallbacks,
            minimumDurationMs,
            maximumCallbacks,
            maximumDurationMs
          } = limits;
          if (
            !Number.isSafeInteger(minimumCallbacks) || minimumCallbacks <= 0 ||
            !Number.isFinite(minimumDurationMs) || minimumDurationMs <= 0 ||
            !Number.isSafeInteger(maximumCallbacks) || maximumCallbacks < minimumCallbacks ||
            !Number.isFinite(maximumDurationMs) || maximumDurationMs < minimumDurationMs
          ) {
            throw new Error('performance callback gate measurement window limits are invalid');
          }
          measurementWindow = {
            status: 'armed',
            minimumCallbacks,
            minimumDurationMs,
            maximumCallbacks,
            maximumDurationMs,
            deliveredCallbackCount: 0,
            startedAt: null,
            closedAt: null,
            closureReason: null
          };
          return snapshot();
        },
        resume(requestedAuthorityId) {
          assertAuthorityId(requestedAuthorityId);
          const callbacks = [...heldCallbacks.values()];
          if (measurementWindow?.status === 'armed') {
            if (callbacks.length !== 1) {
              throw new Error('performance callback gate measurement window lost its held callback before resume');
            }
            measurementWindow.status = 'running';
            measurementWindow.startedAt = performance.now();
          }
          paused = false;
          heldCallbacks.clear();
          callbacks.forEach(invokeCallback);
          return snapshot();
        },
        snapshot(requestedAuthorityId) {
          assertAuthorityId(requestedAuthorityId);
          return snapshot();
        },
        dispose(requestedAuthorityId) {
          assertAuthorityId(requestedAuthorityId);
          let restoreError;
          try {
            restorePatches();
          } catch (error) {
            restoreError = error;
          } finally {
            heldCallbacks.clear();
            pauseAtCallbackCount = null;
            measurementWindow = null;
            paused = false;
            delete window[gateKey];
          }
          if (restoreError) throw restoreError;
          return snapshot();
        }
      })
    });
  }, {
    authorityId,
    expectedMarkerLaunchId,
    gateSymbol,
    requireObservationReset
  });
}

async function useManagedPerformanceCallbackGate(page, {
  authorityId,
  gateSymbol,
  method,
  args = []
} = {}) {
  return page.evaluate(({
    authorityId: expectedAuthorityId,
    gateSymbol: expectedGateSymbol,
    method: requestedMethod,
    args: requestedArgs
  }) => {
    const gate = window[Symbol.for(expectedGateSymbol)];
    if (!gate || typeof gate[requestedMethod] !== 'function') {
      throw new Error('performance callback gate is unavailable');
    }
    return gate[requestedMethod](expectedAuthorityId, ...requestedArgs);
  }, { authorityId, gateSymbol, method, args });
}

export async function installPerformanceCallbackGate(page, launchId) {
  await installManagedPerformanceCallbackGate(page, {
    authorityId: launchId,
    expectedMarkerLaunchId: launchId,
    gateSymbol: PERFORMANCE_CALLBACK_GATE_SYMBOL
  });
}

export async function installExternalPerformanceSentinelGate(page, externalExecutionId) {
  await installManagedPerformanceCallbackGate(page, {
    authorityId: externalExecutionId,
    gateSymbol: PERFORMANCE_EXTERNAL_SENTINEL_GATE_SYMBOL,
    requireObservationReset: true
  });
}

async function usePerformanceCallbackGate(page, launchId, method, args = []) {
  return useManagedPerformanceCallbackGate(page, {
    authorityId: launchId,
    gateSymbol: PERFORMANCE_CALLBACK_GATE_SYMBOL,
    method,
    args
  });
}

async function useExternalPerformanceSentinelGate(page, externalExecutionId, method, args = []) {
  return useManagedPerformanceCallbackGate(page, {
    authorityId: externalExecutionId,
    gateSymbol: PERFORMANCE_EXTERNAL_SENTINEL_GATE_SYMBOL,
    method,
    args
  });
}

export async function pausePerformanceCallbacks(page, launchId) {
  return usePerformanceCallbackGate(page, launchId, 'pause');
}

export async function pausePerformanceCallbacksAt(page, launchId, callbackCount) {
  return usePerformanceCallbackGate(page, launchId, 'pauseAt', [callbackCount]);
}

export async function armPerformanceCallbackWindow(page, launchId, limits) {
  return usePerformanceCallbackGate(page, launchId, 'armWindow', [limits]);
}

export async function resumePerformanceCallbacks(page, launchId) {
  return usePerformanceCallbackGate(page, launchId, 'resume');
}

export async function readPerformanceCallbackGate(page, launchId) {
  return usePerformanceCallbackGate(page, launchId, 'snapshot');
}

export async function removePerformanceCallbackGate(page, launchId) {
  await usePerformanceCallbackGate(page, launchId, 'dispose');
}

export async function pauseExternalPerformanceSentinelCallbacks(page, externalExecutionId) {
  return useExternalPerformanceSentinelGate(page, externalExecutionId, 'pause');
}

export async function pauseExternalPerformanceSentinelCallbacksAt(page, externalExecutionId, callbackCount) {
  return useExternalPerformanceSentinelGate(page, externalExecutionId, 'pauseAt', [callbackCount]);
}

export async function resetExternalPerformanceSentinelGate(page, externalExecutionId) {
  return useExternalPerformanceSentinelGate(page, externalExecutionId, 'reset');
}

export async function armExternalPerformanceSentinelWindow(page, externalExecutionId, limits) {
  return useExternalPerformanceSentinelGate(page, externalExecutionId, 'armWindow', [limits]);
}

export async function resumeExternalPerformanceSentinelCallbacks(page, externalExecutionId) {
  return useExternalPerformanceSentinelGate(page, externalExecutionId, 'resume');
}

export async function readExternalPerformanceSentinelGate(page, externalExecutionId) {
  return useExternalPerformanceSentinelGate(page, externalExecutionId, 'snapshot');
}

export async function removeExternalPerformanceSentinelGate(page, externalExecutionId) {
  await useExternalPerformanceSentinelGate(page, externalExecutionId, 'dispose');
}

export async function readPerformanceControlProbe(page) {
  return page.evaluate((symbolName) => {
    const reader = window[Symbol.for(symbolName)];
    if (typeof reader !== 'function') {
      throw new Error('performance control probe reader is unavailable');
    }
    return reader('snapshot');
  }, PERFORMANCE_CONTROL_PROBE_SYMBOL);
}

export async function resetPerformanceControlProbe(page) {
  return page.evaluate((symbolName) => {
    const reader = window[Symbol.for(symbolName)];
    if (typeof reader !== 'function') {
      throw new Error('performance control probe reader is unavailable');
    }
    return reader('reset');
  }, PERFORMANCE_CONTROL_PROBE_SYMBOL);
}

export async function readPerformanceDiagnostics(page, launchId) {
  return page.evaluate(({ launchId: expectedLaunchId, diagnosticsSymbol }) => {
    const reader = window[Symbol.for(diagnosticsSymbol)];
    if (typeof reader !== 'function') {
      throw new Error('performance renderer diagnostics reader is unavailable');
    }
    return reader(expectedLaunchId);
  }, { launchId, diagnosticsSymbol: PERFORMANCE_RENDERER_DIAGNOSTICS_SYMBOL });
}

export async function resetPerformanceDiagnostics(page, launchId) {
  return page.evaluate(({ launchId: expectedLaunchId, diagnosticsSymbol }) => {
    const reader = window[Symbol.for(diagnosticsSymbol)];
    if (typeof reader !== 'function') {
      throw new Error('performance renderer diagnostics reader is unavailable');
    }
    return reader(expectedLaunchId, 'reset');
  }, { launchId, diagnosticsSymbol: PERFORMANCE_RENDERER_DIAGNOSTICS_SYMBOL });
}

export async function removePerformanceControlProbe(page) {
  await page.evaluate((symbolName) => {
    delete window.prismgbPerformanceControlProbe;
    delete window[Symbol.for(symbolName)];
  }, PERFORMANCE_CONTROL_PROBE_SYMBOL);
}
