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
  'backend-ready',
  'backendExecutionIdentity',
  'requestedBackend',
  'selectedBackend',
  'selectionReason',
  'webgpu-driver-v1',
  'webgpu-worker-ready-v1',
  'isFallbackAdapter',
  'adapter-unavailable',
  'performance-diagnostics',
  'prismgb-e2e-diagnostics',
  'PRISMGB_E2E_DIAGNOSTICS'
]);

const PERFORMANCE_CONTROL_PROBE_SYMBOL = 'prismgb.performance.controlProbe';
const PERFORMANCE_CALLBACK_GATE_SYMBOL = 'prismgb.performance.callbackGate';
const PERFORMANCE_EXTERNAL_SENTINEL_GATE_SYMBOL = 'prismgb.performance.externalSentinelGate';
const PERFORMANCE_RENDERER_DIAGNOSTICS_SYMBOL = 'prismgb.performance.rendererDiagnostics';
const PERFORMANCE_QUALIFICATION_PROBE_SYMBOL = 'prismgb.performance.qualificationProbe';
const PERFORMANCE_MEASUREMENT_PHASES = Object.freeze([
  'startup',
  'qualification-probe',
  'warmup',
  'measurement',
  'submission-seal',
  'drain',
  'shutdown',
  'application-descendant-closure',
  'pre-exit'
]);
const PERFORMANCE_PHASE_PURPOSES = Object.freeze({
  startup: 'startup-identity',
  'qualification-probe': 'qualification',
  warmup: 'warmup',
  'submission-seal': 'submission-seal',
  drain: 'drain',
  shutdown: 'shutdown',
  'application-descendant-closure': 'application-descendant-closure',
  'pre-exit': 'pre-exit'
});

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
  if (!manifest || typeof manifest !== 'object' || manifest.schemaVersion !== 2) {
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

export function performanceBackendSettingValue(backend) {
  if (backend === 'canvas2d') return true;
  if (backend === 'webgpu') return false;
  fail(`unsupported performance backend authority ${backend}`);
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

function assertPerformanceMeasurementToken(value, label) {
  if (!value || typeof value !== 'object' || typeof value.nonce !== 'string' || value.nonce.length === 0) {
    fail(`${label} is invalid`);
  }
}

/**
 * Runs one marker-bound controller command in Electron's main process. The
 * fixture never receives the controller itself, and every command reasserts
 * the launch ID before using its opaque lease tokens.
 */
async function runPerformanceMeasurementControllerCommand(electronApp, command) {
  return electronApp.evaluate(async (_electron, input) => {
    const controller = globalThis[Symbol.for('prismgb.performance.measurementController')];
    if (!controller || typeof controller.assertLaunchId !== 'function') {
      throw new Error('measurement controller is not installed');
    }
    controller.assertLaunchId(input.launchId);
    if (input.kind === 'begin-operation') {
      const { operationToken } = controller.beginOperation(input.launchId);
      const { phaseToken } = controller.beginPhase(operationToken, 'startup');
      controller.sample(phaseToken, 'startup-identity');
      return { operationToken, phaseToken };
    }
    if (input.kind === 'sample-startup-environment') {
      await controller.sampleEnvironment(input.phaseToken);
      return null;
    }
    if (input.kind === 'advance-phase') {
      const { phaseToken } = controller.beginPhase(input.operationToken, input.phase);
      if (input.purpose !== null) controller.sample(phaseToken, input.purpose);
      if (input.phase === 'pre-exit') await controller.sampleEnvironment(phaseToken);
      return { phaseToken };
    }
    if (input.kind === 'record-warmup-identity') {
      controller.sample(input.phaseToken, 'warmup');
      return null;
    }
    if (input.kind === 'record-prime') {
      controller.sample(input.phaseToken, 'prime');
      return null;
    }
    if (input.kind === 'begin-measurement') {
      const { phaseToken } = controller.beginPhase(input.operationToken, 'measurement');
      if (input.measurementEpochId === null) {
        controller.sample(phaseToken, 'measurement');
        return { phaseToken, epochToken: null };
      }
      const { epochToken } = controller.openNumericEpoch(phaseToken, input.measurementEpochId);
      controller.sample(epochToken, 'measurement');
      return { phaseToken, epochToken };
    }
    if (input.kind === 'close-numeric-epoch') {
      return controller.closeNumericEpoch(input.epochToken);
    }
    if (input.kind === 'record-release-dispatched') {
      return controller.recordReleaseDispatched(input.phaseToken, input.releaseDispatchedReceiptAt);
    }
    if (input.kind === 'sample-post-release-settle') {
      return controller.samplePostReleaseSettle(input.phaseToken, input.sampledFixtureAt);
    }
    throw new Error('performance measurement controller command is unsupported');
  }, command);
}

/**
 * Opens the fixture-owned controller lease before the first renderer or child
 * observation. The returned façade carries only opaque tokens and named
 * lifecycle commands; it never exposes the main-process controller object.
 */
export async function openPerformanceMeasurementLease(electronApp, launchId) {
  if (typeof launchId !== 'string' || !/^[0-9a-f-]{36}$/.test(launchId)) {
    fail('performance measurement lease requires a launch UUID');
  }
  const opened = await runPerformanceMeasurementControllerCommand(electronApp, {
    kind: 'begin-operation',
    launchId
  });
  if (!opened || typeof opened !== 'object') fail('performance measurement operation did not return its tokens');
  assertPerformanceMeasurementToken(opened.operationToken, 'performance measurement operation token');
  assertPerformanceMeasurementToken(opened.phaseToken, 'performance measurement startup phase token');

  let operationToken = opened.operationToken;
  let phaseToken = opened.phaseToken;
  let currentPhase = 'startup';
  let epochToken = null;
  let finalized = false;
  let startupEnvironmentRecorded = false;
  let warmupIdentityRecorded = false;
  let primeRecorded = false;
  let releaseDispatchedRecorded = false;
  let postReleaseSettleRecorded = false;
  let postReleaseSettleNotBeforeFixtureAt = null;
  const requireLive = (operation) => {
    if (finalized) fail(`cannot ${operation} after the performance measurement lease is finalized`);
  };

  return Object.freeze({
    async recordStartupEnvironment() {
      requireLive('record the startup performance environment');
      if (currentPhase !== 'startup' || startupEnvironmentRecorded) {
        fail('performance measurement startup environment must be recorded exactly once during startup');
      }
      await runPerformanceMeasurementControllerCommand(electronApp, {
        kind: 'sample-startup-environment',
        launchId,
        phaseToken
      });
      startupEnvironmentRecorded = true;
    },

    async advance(phase) {
      requireLive('advance the performance measurement phase');
      if (phase === 'measurement') {
        fail('performance measurement phase must enter measurement through beginMeasurement');
      }
      if (!PERFORMANCE_MEASUREMENT_PHASES.includes(phase) || !PERFORMANCE_PHASE_PURPOSES[phase]) {
        fail('performance measurement phase is invalid');
      }
      if (phase === 'qualification-probe' && !startupEnvironmentRecorded) {
        fail('performance measurement must record the startup environment before qualification');
      }
      if (phase === 'application-descendant-closure' && !postReleaseSettleRecorded) {
        fail('performance measurement must record the post-release settle sample before application descendant closure');
      }
      const advanced = await runPerformanceMeasurementControllerCommand(electronApp, {
        kind: 'advance-phase',
        launchId,
        operationToken,
        phase,
        purpose: phase === 'warmup' ? null : PERFORMANCE_PHASE_PURPOSES[phase]
      });
      if (!advanced || typeof advanced !== 'object') fail('performance measurement phase did not return a token');
      assertPerformanceMeasurementToken(advanced.phaseToken, 'performance measurement phase token');
      phaseToken = advanced.phaseToken;
      currentPhase = phase;
      if (phase === 'warmup') {
        warmupIdentityRecorded = false;
        primeRecorded = false;
      }
      return Object.freeze({ phase });
    },

    async recordWarmupIdentity() {
      requireLive('record the warmup performance identity');
      if (currentPhase !== 'warmup' || warmupIdentityRecorded) {
        fail('performance measurement warmup identity must be recorded exactly once during warmup');
      }
      await runPerformanceMeasurementControllerCommand(electronApp, {
        kind: 'record-warmup-identity',
        launchId,
        phaseToken
      });
      warmupIdentityRecorded = true;
    },

    async recordPrime() {
      requireLive('record a performance measurement prime');
      if (currentPhase !== 'warmup' || !warmupIdentityRecorded || primeRecorded) {
        fail('performance measurement prime requires the completed warmup identity');
      }
      await runPerformanceMeasurementControllerCommand(electronApp, {
        kind: 'record-prime',
        launchId,
        phaseToken
      });
      primeRecorded = true;
    },

    async beginMeasurement(measurementEpochId = null) {
      requireLive('begin performance measurement');
      if (currentPhase !== 'warmup' || !warmupIdentityRecorded || !primeRecorded) {
        fail('performance measurement must complete warmup identity and prime before measurement');
      }
      if (!(measurementEpochId === null || (typeof measurementEpochId === 'string' && measurementEpochId.length > 0))) {
        fail('performance measurement epoch ID is invalid');
      }
      const begun = await runPerformanceMeasurementControllerCommand(electronApp, {
        kind: 'begin-measurement',
        launchId,
        operationToken,
        measurementEpochId
      });
      if (!begun || typeof begun !== 'object') fail('performance measurement did not return its phase token');
      assertPerformanceMeasurementToken(begun.phaseToken, 'performance measurement phase token');
      if (measurementEpochId === null) {
        if (begun.epochToken !== null) fail('non-instrumented measurement unexpectedly opened a numeric epoch');
      } else {
        assertPerformanceMeasurementToken(begun.epochToken, 'performance measurement epoch token');
      }
      phaseToken = begun.phaseToken;
      epochToken = begun.epochToken;
      currentPhase = 'measurement';
      return Object.freeze({ measurementEpochId });
    },

    async closeNumericEpoch() {
      requireLive('close the performance measurement numeric epoch');
      if (epochToken === null) fail('performance measurement has no open numeric epoch');
      await runPerformanceMeasurementControllerCommand(electronApp, {
        kind: 'close-numeric-epoch',
        launchId,
        epochToken
      });
      epochToken = null;
    },

    async recordReleaseDispatched(releaseDispatchedReceiptAt) {
      requireLive('record the release-dispatched performance boundary');
      if (
        currentPhase !== 'shutdown'
        || releaseDispatchedRecorded
        || postReleaseSettleRecorded
        || !Number.isFinite(releaseDispatchedReceiptAt)
        || releaseDispatchedReceiptAt < 0
      ) {
        fail('performance measurement release-dispatched boundary is invalid');
      }
      const recorded = await runPerformanceMeasurementControllerCommand(electronApp, {
        kind: 'record-release-dispatched',
        launchId,
        phaseToken,
        releaseDispatchedReceiptAt
      });
      if (
        !recorded
        || typeof recorded !== 'object'
        || !Number.isFinite(recorded.notBeforeFixtureAt)
        || recorded.notBeforeFixtureAt !== releaseDispatchedReceiptAt + 1_000
      ) {
        fail('performance measurement release-dispatched boundary did not return its settle deadline');
      }
      releaseDispatchedRecorded = true;
      postReleaseSettleNotBeforeFixtureAt = recorded.notBeforeFixtureAt;
      return Object.freeze({ notBeforeFixtureAt: postReleaseSettleNotBeforeFixtureAt });
    },

    async samplePostReleaseSettle(sampledFixtureAt) {
      requireLive('sample the post-release performance settle boundary');
      if (
        currentPhase !== 'shutdown'
        || !releaseDispatchedRecorded
        || postReleaseSettleRecorded
        || postReleaseSettleNotBeforeFixtureAt === null
        || !Number.isFinite(sampledFixtureAt)
        || sampledFixtureAt < postReleaseSettleNotBeforeFixtureAt
      ) {
        fail('performance measurement post-release settle sample is invalid');
      }
      await runPerformanceMeasurementControllerCommand(electronApp, {
        kind: 'sample-post-release-settle',
        launchId,
        phaseToken,
        sampledFixtureAt
      });
      postReleaseSettleRecorded = true;
    },

    prepareRootExit() {
      requireLive('prepare the performance measurement root exit');
      if (currentPhase !== 'application-descendant-closure' || epochToken !== null || !postReleaseSettleRecorded) {
        fail('performance measurement root exit requires completed application descendant closure after post-release settling');
      }
      finalized = true;
      operationToken = null;
      phaseToken = null;
      return Object.freeze({ ready: true });
    }
  });
}

/**
 * Reads the renderer OS process ID through Electron's main-process authority.
 * This is an external fixture observation; it does not require, install, or
 * expose an application performance control surface.
 */
export async function readElectronRendererProcessId(electronApp) {
  return electronApp.evaluate(({ BrowserWindow }) => {
    const mainWindow = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    if (!mainWindow) throw new Error('performance renderer process requires a live BrowserWindow');
    const pid = mainWindow.webContents.getOSProcessId();
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('performance renderer process ID is invalid');
    return pid;
  });
}

export async function readElectronBrowserProcessIdentity(electronApp) {
  return electronApp.evaluate(({ app }) => {
    const browserMetrics = app.getAppMetrics().filter((metric) => metric.type === 'Browser');
    if (browserMetrics.length !== 1) {
      throw new Error('performance Browser process identity requires exactly one Browser metric');
    }
    const [{ pid, creationTime }] = browserMetrics;
    if (!Number.isSafeInteger(pid) || pid <= 0 ||
      typeof creationTime !== 'number' || !Number.isFinite(creationTime) || creationTime < 0) {
      throw new Error('performance Browser process identity is invalid');
    }
    return { pid, creationTime: String(creationTime) };
  });
}

export async function installPerformanceControlProbe(page, launchId) {
  await page.evaluate(({ launchId: expectedLaunchId, probeSymbol }) => {
    const hasExactKeys = (value, keys) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      const actual = Object.keys(value).sort();
      const expected = [...keys].sort();
      return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
    };
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
          if (message.kind === 'backend-ready') {
            const identity = message.backendExecutionIdentity;
            const adapterIdentity = identity?.adapterIdentity;
            const limits = identity?.limits;
            const validIdentity = identity !== null &&
              hasExactKeys(identity, [
                'backend', 'driver', 'workerProtocol', 'adapterIdentity', 'limits',
                'isFallbackAdapter', 'powerPreference'
              ]) &&
              identity.backend === 'webgpu' &&
              identity.driver === 'webgpu-driver-v1' &&
              identity.workerProtocol === 'webgpu-worker-ready-v1' &&
              hasExactKeys(adapterIdentity, ['vendor', 'architecture', 'device', 'description']) &&
              Object.values(adapterIdentity).every((value) => value === null || typeof value === 'string') &&
              hasExactKeys(limits, ['maxTextureDimension2D', 'maxBindGroups']) &&
              Number.isSafeInteger(limits.maxTextureDimension2D) &&
              limits.maxTextureDimension2D > 0 &&
              Number.isSafeInteger(limits.maxBindGroups) &&
              limits.maxBindGroups > 0 &&
              typeof identity.isFallbackAdapter === 'boolean' &&
              ['low-power', 'high-performance'].includes(identity.powerPreference);
            if (
              !hasExactKeys(message, [
                'kind', 'launchId', 'observedAt', 'requestedBackend', 'selectedBackend',
                'selectionReason', 'backendExecutionIdentity'
              ]) ||
              typeof message.observedAt !== 'number' ||
              !Number.isFinite(message.observedAt) ||
              !['canvas2d', 'webgpu'].includes(message.requestedBackend) ||
              !['canvas2d', 'webgpu'].includes(message.selectedBackend) ||
              ![
                'requested-canvas2d', 'performance-mode-canvas2d', 'webgpu-api-unavailable',
                'webgpu-adapter-unavailable', 'transfer-api-unavailable', 'transfer-method-unavailable',
                'transfer-allowlisted-not-supported', 'webgpu-selected', 'fatal-detector-reason'
              ].includes(message.selectionReason) ||
              (message.selectedBackend === 'webgpu' ? !validIdentity : identity !== null)
            ) {
              throw new Error('performance control probe received invalid backend readiness evidence');
            }
          } else if (message.kind === 'source-opportunity') {
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
          writes.push(Object.freeze({ ...message }));
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
    let activeCallbackOrdinal = null;
    let callbackOverlapCount = 0;
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
      activeCallbackOrdinal = null;
      callbackOverlapCount = 0;
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
          callbackOverlapCount,
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
      if (!isWindowRunning()) return callback.call(video, now, metadata);

      if (activeCallbackOrdinal !== null) {
        callbackOverlapCount += 1;
      }
      measurementWindow.deliveredCallbackCount += 1;
      const callbackOrdinal = measurementWindow.deliveredCallbackCount;
      activeCallbackOrdinal = callbackOrdinal;
      callbackObservations.push(nextObservation('renderer-callback', {
        callbackOrdinal,
        mediaTime: Number.isFinite(metadata?.mediaTime) ? metadata.mediaTime : null
      }));
      const finishCallback = () => {
        if (activeCallbackOrdinal === callbackOrdinal) activeCallbackOrdinal = null;
      };
      try {
        const result = callback.call(video, now, metadata);
        if (result && typeof result.then === 'function') {
          void Promise.resolve(result).then(finishCallback, finishCallback);
        } else {
          finishCallback();
        }
        return result;
      } catch (error) {
        finishCallback();
        throw error;
      }
    };
    const observeWorkerMessage = (data) => {
      if (!isWindowOpenOrClosed() || !isRecord(data)) return;
      if (data.type === 'frameRendered') {
        const payload = data.payload;
        const tagged = isRecord(payload) && Number.isSafeInteger(payload.frameToken) && payload.frameToken > 0;
        acknowledgementObservations.push(nextObservation('worker-frame-acknowledged', {
          tagged,
          frameToken: tagged ? payload.frameToken : null
        }));
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
            const isFramePost = isWindowRunning() && isRecord(message) && message.type === 'frame';
            const startedAt = isFramePost ? performance.now() : null;
            const result = Reflect.apply(originalPostMessage, this, [message, ...args]);
            if (isFramePost) {
              workerFramePostObservations.push(nextObservation('worker-frame-posted', {
                callbackOrdinal: activeCallbackOrdinal,
                startedAt,
                endedAt: performance.now()
              }));
            }
            return result;
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
          const isStreamDraw = this.canvas?.id === 'streamCanvas';
          const shouldObserve = isStreamDraw && isWindowRunning();
          const startedAt = shouldObserve ? performance.now() : null;
          const result = Reflect.apply(originalDrawImage, this, args);
          if (isStreamDraw) {
            if (shouldObserve) {
              canvasDrawObservations.push(nextObservation('canvas-draw-completed', {
                callbackOrdinal: activeCallbackOrdinal,
                startedAt,
                endedAt: performance.now()
              }));
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
            terminalClosureEnd: null,
            closureReason: null
          };
          return snapshot();
        },
        seal(requestedAuthorityId) {
          assertAuthorityId(requestedAuthorityId);
          const outstandingWorkerFrames = workerFramePostObservations.length
            - acknowledgementObservations.length
            - errorObservations.length;
          if (
            measurementWindow?.status !== 'closed'
            || !paused
            || heldCallbacks.size !== 1
            || outstandingWorkerFrames !== 0
            || postPauseCanvasDrawCount !== 0
            || callbackOverlapCount !== 0
          ) {
            throw new Error('external performance sentinel cannot seal before its callback and backend work are closed');
          }
          if (measurementWindow.terminalClosureEnd !== null) {
            throw new Error('external performance sentinel closure is already sealed');
          }
          measurementWindow.terminalClosureEnd = performance.now();
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

export async function sealExternalPerformanceSentinelGate(page, externalExecutionId) {
  return useExternalPerformanceSentinelGate(page, externalExecutionId, 'seal');
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

export async function readPerformanceQualificationProbe(page, launchId) {
  return page.evaluate(({ launchId: expectedLaunchId, qualificationSymbol }) => {
    const probe = window[Symbol.for(qualificationSymbol)];
    if (typeof probe !== 'function') {
      throw new Error('performance qualification probe is unavailable');
    }
    return probe(expectedLaunchId);
  }, { launchId, qualificationSymbol: PERFORMANCE_QUALIFICATION_PROBE_SYMBOL });
}

export async function removePerformanceControlProbe(page) {
  await page.evaluate((symbolName) => {
    delete window.prismgbPerformanceControlProbe;
    delete window[Symbol.for(symbolName)];
  }, PERFORMANCE_CONTROL_PROBE_SYMBOL);
}

const PERFORMANCE_ABORT_LAST_BOUNDARY = Object.freeze({
  open: 'open',
  'reset-a': 'open',
  'side-a': 'reset-a',
  'reset-b': 'side-a',
  'side-b': 'reset-b',
  close: 'side-b'
});

/** @param {any} [options] */
export function createAbortedPerformanceMetricSessionClose({
  sequence,
  metricSessionId,
  phase,
  backend,
  reason,
  abortEvidence,
  resourcesClosed,
  applicationDescendantClosureEnd = null
} = {}) {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || typeof metricSessionId !== 'string' || metricSessionId.length === 0) {
    fail('aborted metric-session close identity is invalid');
  }
  const lastBoundary = PERFORMANCE_ABORT_LAST_BOUNDARY[phase];
  if (!lastBoundary || typeof reason !== 'string' || reason.length === 0
    || (phase.startsWith('side-') ? !['canvas2d', 'webgpu'].includes(backend) : backend !== 'none')) {
    fail('aborted metric-session close reason is invalid');
  }
  const { adapterId, startedAt, endedAt, closure } = abortEvidence ?? {};
  if (resourcesClosed !== true || typeof adapterId !== 'string' || adapterId.length === 0
    || !Number.isFinite(startedAt) || !Number.isFinite(endedAt) || startedAt < 0 || endedAt < startedAt
    || !closure || closure.adapterId !== adapterId || !Array.isArray(closure.transitions)
    || closure.transitions.at(-1)?.operation !== 'abort') {
    fail('aborted metric-session close has no canonical zero-survivor proof');
  }
  if (phase.startsWith('side-')) {
    if (!Number.isFinite(applicationDescendantClosureEnd)
      || applicationDescendantClosureEnd < 0
      || applicationDescendantClosureEnd > startedAt) {
      fail('failed application cleanup must precede the adapter abort close');
    }
  } else if (applicationDescendantClosureEnd !== null) {
    fail('non-side adapter abort close cannot claim an application cleanup boundary');
  }
  return Object.freeze({
    sequence,
    operationId: 'metric-adapter-session-close',
    start: startedAt,
    end: endedAt,
    metricSessionId,
    outcome: 'aborted',
    abortReason: Object.freeze({ phase, backend, reason }),
    lastBoundary,
    closure: Object.freeze({
      closed: true,
      stdoutDrained: true,
      stderrDrained: true,
      inputClosed: true,
      exit: Object.freeze({ code: 0, durationMs: (endedAt - startedAt) * 1000 }),
      zeroSurvivors: true
    }),
    closureEnd: endedAt
  });
}

export async function executePerformancePairAttemptSequence({ pair, executeAttempt, assessCompletedAttempt }) {
  if (!pair || typeof pair !== 'object' || !Array.isArray(pair.attempts) || pair.attempts.length !== 3) {
    throw new Error('performance pair attempt sequence requires exactly three preallocated attempts');
  }
  if (typeof executeAttempt !== 'function' || typeof assessCompletedAttempt !== 'function') {
    throw new Error('performance pair attempt sequence requires execution and assessment callbacks');
  }
  const completed = [];
  let retryReason = null;
  for (const [offset, attempt] of pair.attempts.entries()) {
    if (!attempt || attempt.attemptIndex !== offset + 1) {
      throw new Error('performance pair attempt indices must be contiguous from one');
    }
    const projection = await executeAttempt({ pair, attempt, retryReason });
    const assessment = await assessCompletedAttempt({
      pair,
      attempt,
      retryReason,
      projection,
      completed: Object.freeze([...completed])
    });
    if (!assessment || typeof assessment !== 'object'
      || typeof assessment.disposition !== 'string'
      || typeof assessment.retryAllowed !== 'boolean') {
      throw new Error('performance pair attempt assessor returned an invalid result');
    }
    completed.push(Object.freeze({ attemptIndex: attempt.attemptIndex, retryReason, projection, assessment }));
    if (assessment.disposition !== 'retryable') {
      if (assessment.retryAllowed !== false || assessment.nextAttemptIndex !== null) {
        throw new Error('terminal performance pair assessment cannot authorize a retry');
      }
      return Object.freeze({ terminal: assessment, completed: Object.freeze(completed) });
    }
    if (assessment.retryAllowed !== true || typeof assessment.reason !== 'string'
      || assessment.reason.length === 0 || assessment.nextAttemptIndex !== attempt.attemptIndex + 1) {
      throw new Error('retryable performance pair assessment does not authorize the next attempt');
    }
    if (offset === pair.attempts.length - 1) {
      throw new Error('performance pair assessor exceeded the original-plus-two attempt cap');
    }
    retryReason = assessment.reason;
  }
  throw new Error('performance pair attempt sequence ended without a terminal assessment');
}
