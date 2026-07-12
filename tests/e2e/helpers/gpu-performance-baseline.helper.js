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
      value: () => writes.map((write) => ({ ...write }))
    });
  }, { launchId, probeSymbol: PERFORMANCE_CONTROL_PROBE_SYMBOL });
}

export async function readPerformanceControlProbe(page) {
  return page.evaluate((symbolName) => {
    const reader = window[Symbol.for(symbolName)];
    if (typeof reader !== 'function') {
      throw new Error('performance control probe reader is unavailable');
    }
    return reader();
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
