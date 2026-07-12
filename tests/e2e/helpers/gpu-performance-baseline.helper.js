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

export async function installPerformanceCallbackGate(page, launchId) {
  await page.evaluate(({ launchId: expectedLaunchId, gateSymbol }) => {
    const marker = window.prismgbPerformanceLaunchMarker;
    if (marker?.launchId !== expectedLaunchId) {
      throw new Error('cannot install a callback gate without the validated renderer marker');
    }
    const gateKey = Symbol.for(gateSymbol);
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
    const heldCallbacks = new Map();
    let paused = false;
    let pauseAtCallbackCount = null;
    let interceptedCallbackCount = 0;
    let measurementWindow = null;

    const assertLaunchId = (requestedLaunchId) => {
      if (requestedLaunchId !== expectedLaunchId) {
        throw new Error('performance callback gate launch ID does not match the preload marker');
      }
    };
    const snapshot = () => ({
      paused,
      heldCallbackCount: heldCallbacks.size,
      interceptedCallbackCount,
      pauseAtCallbackCount,
      measurementWindow: measurementWindow === null ? null : { ...measurementWindow }
    });
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
      if (measurementWindow?.status === 'running') {
        measurementWindow.deliveredCallbackCount += 1;
      }
      return callback.call(video, now, metadata);
    };

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

    if (cancelDescriptor && typeof originalCancel === 'function') {
      Object.defineProperty(videoPrototype, 'cancelVideoFrameCallback', {
        ...cancelDescriptor,
        value: function patchedCancelVideoFrameCallback(frameCallbackHandle) {
          heldCallbacks.delete(frameCallbackHandle);
          return Reflect.apply(originalCancel, this, [frameCallbackHandle]);
        }
      });
    }

    Object.defineProperty(window, gateKey, {
      configurable: true,
      enumerable: false,
      writable: false,
      value: Object.freeze({
        pause(requestedLaunchId) {
          assertLaunchId(requestedLaunchId);
          if (measurementWindow?.status === 'running') {
            throw new Error('performance callback gate cannot pause an active measurement window');
          }
          paused = true;
          pauseAtCallbackCount = null;
          return snapshot();
        },
        pauseAt(requestedLaunchId, requestedCallbackCount) {
          assertLaunchId(requestedLaunchId);
          if (measurementWindow?.status === 'running') {
            throw new Error('performance callback gate cannot set a pause target during an active measurement window');
          }
          if (!Number.isSafeInteger(requestedCallbackCount) || requestedCallbackCount <= interceptedCallbackCount) {
            throw new Error('performance callback gate pause target must be a future callback count');
          }
          pauseAtCallbackCount = requestedCallbackCount;
          return snapshot();
        },
        armWindow(requestedLaunchId, limits) {
          assertLaunchId(requestedLaunchId);
          if (!paused || heldCallbacks.size !== 1) {
            throw new Error('performance callback gate requires exactly one held callback before arming a measurement window');
          }
          if (measurementWindow !== null) {
            throw new Error('performance callback gate measurement window is already armed');
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
        resume(requestedLaunchId) {
          assertLaunchId(requestedLaunchId);
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
        snapshot(requestedLaunchId) {
          assertLaunchId(requestedLaunchId);
          return snapshot();
        },
        dispose(requestedLaunchId) {
          assertLaunchId(requestedLaunchId);
          heldCallbacks.clear();
          pauseAtCallbackCount = null;
          measurementWindow = null;
          Object.defineProperty(videoPrototype, 'requestVideoFrameCallback', requestDescriptor);
          if (cancelDescriptor) {
            Object.defineProperty(videoPrototype, 'cancelVideoFrameCallback', cancelDescriptor);
          }
          delete window[gateKey];
          return snapshot();
        }
      })
    });
  }, { launchId, gateSymbol: PERFORMANCE_CALLBACK_GATE_SYMBOL });
}

async function usePerformanceCallbackGate(page, launchId, method, args = []) {
  return page.evaluate(({ launchId: expectedLaunchId, gateSymbol, method: requestedMethod, args: requestedArgs }) => {
    const gate = window[Symbol.for(gateSymbol)];
    if (!gate || typeof gate[requestedMethod] !== 'function') {
      throw new Error('performance callback gate is unavailable');
    }
    return gate[requestedMethod](expectedLaunchId, ...requestedArgs);
  }, { launchId, gateSymbol: PERFORMANCE_CALLBACK_GATE_SYMBOL, method, args });
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
