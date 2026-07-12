import { test as base, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createExternalMetricCadenceCapture,
  createExternalMetricRunCapture,
  createPlatformExternalMetricSession,
  createPlatformExternalMetricAdapterSession,
  readLinuxProcfsMetricConfiguration,
  resolvePlatformExternalMetricTarget
} from '../../../scripts/lib/process-runner.js';
import { ChromaticDeviceFixture } from './chromatic-device.fixture.js';
import { AppShellPage } from '../pages/app-shell.page.js';
import {
  armExternalPerformanceSentinelWindow,
  assertPerformanceController,
  createExternalPerformanceExecutionId,
  createPerformanceLaunchId,
  getPerformanceBuild,
  installExternalPerformanceSentinelGate,
  installPerformanceControlProbe,
  loadPerformanceBuildManifest,
  openPerformanceMeasurementLease,
  pauseExternalPerformanceSentinelCallbacks,
  pauseExternalPerformanceSentinelCallbacksAt,
  readElectronRendererProcessId,
  readExternalPerformanceSentinelGate,
  removeExternalPerformanceSentinelGate,
  removePerformanceControlProbe,
  readPerformanceControlProbe,
  readPerformanceDiagnostics,
  resetExternalPerformanceSentinelGate,
  resetPerformanceControlProbe,
  resumeExternalPerformanceSentinelCallbacks,
  sealExternalPerformanceSentinelGate,
  resetPerformanceDiagnostics
} from '../helpers/gpu-performance-baseline.helper.js';
import {
  validatePerformanceRootExitAuditFile,
  validatePerformanceRootExitObservation
} from '../../../scripts/lib/performance-controller-audit.js';

async function rethrowAfterMetricCleanup(primaryError, cleanup, label) {
  try {
    await cleanup();
  } catch (cleanupError) {
    const errors = primaryError instanceof AggregateError ? [...primaryError.errors] : [primaryError];
    throw new AggregateError([...errors, cleanupError], `${label} and metric cleanup both failed`);
  }
  throw primaryError;
}

/**
 * @param {{
 *   build: { directory: string, harness: boolean, instrumentation: boolean },
 *   launchId: string | null,
 *   userDataDirectory: string,
 *   baseEnvironment?: NodeJS.ProcessEnv,
 *   performanceDiagnostics: boolean
 * }} options
 */
export function createPerformanceElectronLaunchOptions({
  build,
  launchId,
  userDataDirectory,
  baseEnvironment = process.env,
  performanceDiagnostics
} = {}) {
  if (!build || typeof build !== 'object' || typeof build.directory !== 'string' || build.directory.length === 0) {
    throw new Error('performance launch requires a build directory');
  }
  if (typeof build.harness !== 'boolean' || typeof build.instrumentation !== 'boolean') {
    throw new Error('performance launch build flags are invalid');
  }
  if (typeof userDataDirectory !== 'string' || userDataDirectory.length === 0) {
    throw new Error('performance launch requires a user-data directory');
  }
  if (!baseEnvironment || typeof baseEnvironment !== 'object') {
    throw new Error('performance launch environment is invalid');
  }
  if (typeof performanceDiagnostics !== 'boolean') {
    throw new Error('performance diagnostics flag is invalid');
  }
  if (build.harness && (typeof launchId !== 'string' || launchId.length === 0)) {
    throw new Error('harness performance launch requires a launch ID');
  }
  if (!build.harness && launchId !== null) {
    throw new Error('production performance launch must not receive a launch ID');
  }
  const args = [
    path.join(build.directory, 'main', 'index.js'),
    '--test-mode',
    `--user-data-dir=${userDataDirectory}`,
    '--no-sandbox',
    '--disable-dev-shm-usage'
  ];
  if (launchId !== null) args.splice(2, 0, `--prismgb-performance-launch-id=${launchId}`);
  const rootExitAuditPath = build.harness
    ? path.join(userDataDirectory, 'root-exit-audit.json')
    : null;
  const environment = {
    ...baseEnvironment,
    NODE_ENV: 'test',
    ELECTRON_IS_DEV: '0',
    DISABLE_AUTO_UPDATER: 'true',
    DISABLE_CRASH_REPORTER: 'true',
    DISABLE_TRAY: 'true',
    PRISMGB_E2E_TEST_CONTROL: '1'
  };
  if (build.harness) {
    Object.assign(environment, {
      PRISMGB_PERF_MEASUREMENT: '1',
      PRISMGB_PERF_LAUNCH_ID: launchId,
      PRISMGB_E2E_DIAGNOSTICS: build.instrumentation && performanceDiagnostics ? '1' : '0',
      PRISMGB_PERF_ROOT_EXIT_AUDIT_PATH: rootExitAuditPath
    });
  } else {
    delete environment.PRISMGB_PERF_MEASUREMENT;
    delete environment.PRISMGB_PERF_LAUNCH_ID;
    delete environment.PRISMGB_E2E_DIAGNOSTICS;
    delete environment.PRISMGB_PERF_ROOT_EXIT_AUDIT_PATH;
  }
  return Object.freeze({
    args: Object.freeze(args),
    env: Object.freeze(environment),
    rootExitAuditPath
  });
}

function isObservedProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ESRCH') return false;
    throw error;
  }
}

/**
 * Waits for an externally observed PID to disappear. A surviving or reused
 * PID is intentionally fatal: either outcome invalidates terminal closure.
 *
 * @param {{
 *   pid: number,
 *   timeoutMs?: number,
 *   clock?: () => number,
 *   isAlive?: (pid: number) => boolean | Promise<boolean>,
 *   wait?: (milliseconds: number) => Promise<void>
 * }} options
 * @returns {Promise<number>}
 */
export async function waitForObservedProcessTermination({
  pid,
  timeoutMs = 5000,
  clock = () => performance.now(),
  isAlive = isObservedProcessAlive,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
} = {}) {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw new Error('performance root-exit observation requires a positive process PID');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || typeof clock !== 'function'
    || typeof isAlive !== 'function' || typeof wait !== 'function') {
    throw new Error('performance root-exit observation options are invalid');
  }
  const deadline = clock() + timeoutMs;
  while (true) {
    if (!await isAlive(pid)) return clock();
    if (clock() >= deadline) {
      throw new Error(`performance root-exit observation timed out waiting for PID ${pid}`);
    }
    await wait(Math.min(25, Math.max(1, deadline - clock())));
  }
}

/**
 * @param {{
 *   auditPath: string,
 *   instrumentation: boolean,
 *   readFile?: (path: string, encoding: 'utf8') => Promise<string>
 * }} options
 */
export async function readPerformanceRootExitAudit({
  auditPath,
  instrumentation,
  readFile = fs.readFile
} = {}) {
  if (typeof auditPath !== 'string' || !path.isAbsolute(auditPath) || typeof instrumentation !== 'boolean'
    || typeof readFile !== 'function') {
    throw new Error('performance root-exit audit reader options are invalid');
  }
  let parsed;
  try {
    parsed = JSON.parse(await readFile(auditPath, 'utf8'));
  } catch (error) {
    const unreadable = new Error(
      `performance root-exit audit is unreadable: ${error instanceof Error ? error.message : String(error)}`
    );
    if (error && typeof error === 'object' && typeof error.code === 'string') {
      unreadable.code = error.code;
    }
    throw unreadable;
  }
  return validatePerformanceRootExitAuditFile(parsed, { instrumentation });
}

/**
 * @param {{
 *   rootExitAudit: { controllerAudit: unknown, launchId: string },
 *   clock?: () => number,
 *   waitForTermination?: (options: { pid: number }) => Promise<number>
 * }} options
 * @returns {Promise<unknown>}
 */
export async function observePerformanceRootExit({
  rootExitAudit,
  clock = () => performance.now(),
  waitForTermination = waitForObservedProcessTermination
} = {}) {
  if (!rootExitAudit || typeof rootExitAudit !== 'object' || typeof clock !== 'function'
    || typeof waitForTermination !== 'function') {
    throw new Error('performance root-exit observer options are invalid');
  }
  const gate = rootExitAudit.controllerAudit?.rootExitGate;
  if (!gate || typeof gate !== 'object') {
    throw new Error('performance root-exit audit has no root-exit gate evidence');
  }
  const rootExitObservedAt = await waitForTermination({ pid: gate.root.pid });
  const frameworkExitTimes = await Promise.all(gate.frameworkSurvivors.map((survivor) => (
    waitForTermination({ pid: survivor.pid })
  )));
  const terminalClosureEnd = Math.max(rootExitObservedAt, ...frameworkExitTimes);
  return validatePerformanceRootExitObservation({
    launchId: rootExitAudit.launchId,
    protocol: 'electron-application-close',
    rootExitObservedAt,
    terminalClosureEnd,
    root: gate.root,
    frameworkSurvivors: gate.frameworkSurvivors
  }, { controllerAudit: rootExitAudit.controllerAudit });
}

/**
 * Resolves the renderer's PID-reuse-resistant metric target exclusively from
 * the external fixture runner. The returned target is deliberately separate
 * from opening a pair session, so the runner can reuse one adapter across the
 * two launch sides of a comparison.
 *
 * @param {{
 *   platform?: NodeJS.Platform,
 *   rendererPid: number,
 *   externalExecutionId: string,
 *   readLinuxConfiguration?: typeof readLinuxProcfsMetricConfiguration,
 *   resolveTarget?: typeof resolvePlatformExternalMetricTarget
 * }} options
 */
export async function resolvePerformanceRendererMetricTarget({
  platform = process.platform,
  rendererPid,
  externalExecutionId,
  readLinuxConfiguration = readLinuxProcfsMetricConfiguration,
  resolveTarget = resolvePlatformExternalMetricTarget
} = {}) {
  if (!Number.isSafeInteger(rendererPid) || rendererPid <= 0) {
    throw new Error('performance renderer metric target requires a positive renderer PID');
  }
  if (typeof externalExecutionId !== 'string' || !/^[0-9a-f-]{36}$/.test(externalExecutionId)) {
    throw new Error('performance renderer metric target requires an external execution UUID');
  }
  if (typeof readLinuxConfiguration !== 'function' || typeof resolveTarget !== 'function') {
    throw new Error('performance renderer metric target requires external adapter resolvers');
  }
  const options = platform === 'linux'
    ? { linux: await readLinuxConfiguration() }
    : {};
  return resolveTarget({
    platform,
    pid: rendererPid,
    processIdentity: `renderer:${externalExecutionId}:${rendererPid}`,
    ...options
  });
}

/**
 * Opens one external metric authority for a complete cold-launch comparison.
 * Each side resolves its renderer only after that application starts, then
 * attaches and detaches within this shared session. This keeps the platform
 * adapter timebase and any persistent sampler owned by the pair rather than a
 * single launch.
 *
 * @param {{
 *   platform?: NodeJS.Platform,
 *   readLinuxConfiguration?: typeof readLinuxProcfsMetricConfiguration,
 *   createSession?: (options: object) => Promise<any> | any,
 *   resolveTarget?: typeof resolvePlatformExternalMetricTarget,
 *   createRunCapture?: typeof createExternalMetricRunCapture,
 *   createCadenceCapture?: typeof createExternalMetricCadenceCapture
 * }} options
 */
export async function openPerformanceRendererMetricPairSession({
  platform = process.platform,
  readLinuxConfiguration = readLinuxProcfsMetricConfiguration,
  createSession = createPlatformExternalMetricSession,
  resolveTarget = resolvePlatformExternalMetricTarget,
  createRunCapture = createExternalMetricRunCapture,
  createCadenceCapture = createExternalMetricCadenceCapture
} = {}) {
  if (typeof platform !== 'string' || platform.length === 0) {
    throw new Error('performance renderer metric pair session requires a platform');
  }
  if (typeof readLinuxConfiguration !== 'function'
    || typeof createSession !== 'function'
    || typeof resolveTarget !== 'function'
    || typeof createRunCapture !== 'function'
    || typeof createCadenceCapture !== 'function') {
    throw new Error('performance renderer metric pair session requires external metric factories');
  }

  const adapterOptions = platform === 'linux'
    ? { linux: await readLinuxConfiguration() }
    : {};
  const adapter = await createSession({ platform, ...adapterOptions });
  if (!adapter || typeof adapter !== 'object' || typeof adapter.adapterId !== 'string'
    || !adapter.session || typeof adapter.session !== 'object') {
    throw new Error('performance renderer metric pair adapter did not return a session');
  }
  for (const operation of ['open', 'close', 'abort']) {
    if (typeof adapter.session[operation] !== 'function') {
      throw new Error(`performance renderer metric pair session must implement ${operation}`);
    }
  }

  let state = 'opening';
  let activeSide = null;
  try {
    await adapter.session.open();
    state = 'open';
  } catch (error) {
    state = 'failed';
    await rethrowAfterMetricCleanup(
      error,
      () => adapter.session.abort(),
      'performance metric pair session initialization'
    );
  }

  const requireOpen = (operation) => {
    if (state !== 'open') {
      throw new Error(`cannot ${operation} when the performance renderer metric pair session is ${state}`);
    }
  };

  const resolveSideTarget = async ({ rendererPid, externalExecutionId }) => {
    if (!Number.isSafeInteger(rendererPid) || rendererPid <= 0) {
      throw new Error('performance renderer metric pair side requires a positive renderer PID');
    }
    if (typeof externalExecutionId !== 'string' || !/^[0-9a-f-]{36}$/.test(externalExecutionId)) {
      throw new Error('performance renderer metric pair side requires an external execution UUID');
    }
    const resolved = await resolveTarget({
      platform,
      pid: rendererPid,
      processIdentity: `renderer:${externalExecutionId}:${rendererPid}`,
      ...adapterOptions
    });
    if (!resolved || typeof resolved !== 'object' || resolved.adapterId !== adapter.adapterId
      || !resolved.target || typeof resolved.target !== 'object') {
      throw new Error('performance renderer metric pair side does not match its adapter');
    }
    return resolved.target;
  };

  return Object.freeze({
    adapterId: adapter.adapterId,
    getState() {
      return state;
    },
    async openSide(input) {
      requireOpen('open a metric pair side');
      if (activeSide !== null) {
        throw new Error('cannot open a metric pair side while another side is active');
      }
      const target = await resolveSideTarget(input);
      const runCapture = createRunCapture({ session: adapter.session, target });
      const cadenceCapture = createCadenceCapture({ capture: runCapture });
      const side = { state: 'opening', target, cadenceCapture };
      activeSide = side;
      try {
        await cadenceCapture.attachAndPrime();
        side.state = 'active';
      } catch (error) {
        side.state = 'failed';
        activeSide = null;
        state = 'failed';
        await rethrowAfterMetricCleanup(
          error,
          () => adapter.session.abort(),
          'performance metric pair side attachment'
        );
      }

      const requireActiveSide = (operation) => {
        requireOpen(operation);
        if (activeSide !== side || side.state !== 'active') {
          throw new Error(`cannot ${operation} when the performance renderer metric pair side is ${side.state}`);
        }
      };

      return Object.freeze({
        adapterId: adapter.adapterId,
        target: Object.freeze({ ...target }),
        async beginWindow() {
          requireActiveSide('begin the metric pair window');
          return cadenceCapture.beginWindow();
        },
        async sampleInWindow() {
          requireActiveSide('sample the metric pair window');
          return cadenceCapture.sampleInWindow();
        },
        markTerminalClosure(terminalClosureEnd) {
          requireActiveSide('mark metric pair terminal closure');
          return cadenceCapture.markTerminalClosure(terminalClosureEnd);
        },
        async sampleTerminalClosure() {
          requireActiveSide('sample metric pair terminal closure');
          return cadenceCapture.sampleTerminalClosure();
        },
        getNextSampleTargetAt() {
          requireActiveSide('read the next metric pair sample target');
          return cadenceCapture.getNextSampleTargetAt();
        },
        getAudit() {
          return cadenceCapture.getAudit();
        },
        async finalize() {
          requireActiveSide('finalize the metric pair side');
          side.state = 'finalizing';
          try {
            const transcript = await cadenceCapture.detach();
            side.state = 'closed';
            activeSide = null;
            return transcript;
          } catch (error) {
            side.state = 'failed';
            activeSide = null;
            state = 'failed';
            await rethrowAfterMetricCleanup(
              error,
              () => adapter.session.abort(),
              'performance metric pair side finalization'
            );
          }
        },
        async abort() {
          requireActiveSide('abort the metric pair side');
          side.state = 'aborting';
          try {
            const result = await cadenceCapture.abort();
            side.state = 'aborted';
            activeSide = null;
            state = 'aborted';
            return result;
          } catch (error) {
            side.state = 'failed';
            activeSide = null;
            state = 'failed';
            throw error;
          }
        }
      });
    },
    async close() {
      requireOpen('close the metric pair session');
      if (activeSide !== null) {
        throw new Error('cannot close the metric pair session with an active side');
      }
      state = 'closing';
      try {
        const closure = await adapter.session.close();
        state = 'closed';
        return closure;
      } catch (error) {
        state = 'failed';
        await rethrowAfterMetricCleanup(
          error,
          () => adapter.session.abort(),
          'performance metric pair session close'
        );
      }
    },
    async abort() {
      requireOpen('abort the metric pair session');
      state = 'aborting';
      try {
        const result = await adapter.session.abort();
        activeSide = null;
        state = 'aborted';
        return result;
      } catch (error) {
        state = 'failed';
        throw error;
      }
    }
  });
}

/**
 * Opens, attaches, and primes the external renderer metric authority for one
 * launch. The returned facade deliberately does not expose its platform
 * session: callers must either finalize a complete cadence transcript or
 * abort it, which prevents a detached capture from leaking its OS resource.
 * A comparison runner may instead retain its own adapter session across both
 * sides; this fixture helper is for a single externally observed launch.
 *
 * @param {{
 *   platform?: NodeJS.Platform,
 *   rendererPid: number,
 *   externalExecutionId: string,
 *   readLinuxConfiguration?: typeof readLinuxProcfsMetricConfiguration,
 *   createAdapter?: (options: object) => Promise<any> | any,
 *   createRunCapture?: typeof createExternalMetricRunCapture,
 *   createCadenceCapture?: typeof createExternalMetricCadenceCapture
 * }} options
 */
export async function openPerformanceRendererMetricCapture({
  platform = process.platform,
  rendererPid,
  externalExecutionId,
  readLinuxConfiguration = readLinuxProcfsMetricConfiguration,
  createAdapter = createPlatformExternalMetricAdapterSession,
  createRunCapture = createExternalMetricRunCapture,
  createCadenceCapture = createExternalMetricCadenceCapture
} = {}) {
  if (!Number.isSafeInteger(rendererPid) || rendererPid <= 0) {
    throw new Error('performance renderer metric capture requires a positive renderer PID');
  }
  if (typeof externalExecutionId !== 'string' || !/^[0-9a-f-]{36}$/.test(externalExecutionId)) {
    throw new Error('performance renderer metric capture requires an external execution UUID');
  }
  if (typeof createAdapter !== 'function' || typeof createRunCapture !== 'function' || typeof createCadenceCapture !== 'function') {
    throw new Error('performance renderer metric capture requires external metric capture factories');
  }
  if (platform === 'linux' && typeof readLinuxConfiguration !== 'function') {
    throw new Error('performance renderer metric capture requires a Linux metric configuration reader');
  }

  const adapterOptions = platform === 'linux'
    ? { linux: await readLinuxConfiguration() }
    : {};
  const adapter = await createAdapter({
    platform,
    pid: rendererPid,
    processIdentity: `renderer:${externalExecutionId}:${rendererPid}`,
    ...adapterOptions
  });
  if (!adapter || typeof adapter !== 'object' || typeof adapter.adapterId !== 'string'
    || !adapter.target || typeof adapter.target !== 'object'
    || !adapter.session || typeof adapter.session !== 'object') {
    throw new Error('performance renderer metric adapter did not return a target and session');
  }
  for (const operation of ['open', 'close', 'abort']) {
    if (typeof adapter.session[operation] !== 'function') {
      throw new Error(`performance renderer metric adapter session must implement ${operation}`);
    }
  }

  let state = 'opening';
  let cadenceCapture;
  try {
    await adapter.session.open();
    const runCapture = createRunCapture({ session: adapter.session, target: adapter.target });
    cadenceCapture = createCadenceCapture({ capture: runCapture });
    await cadenceCapture.attachAndPrime();
    state = 'active';
  } catch (error) {
    state = 'failed';
    await rethrowAfterMetricCleanup(
      error,
      () => adapter.session.abort(),
      'performance renderer metric capture initialization'
    );
  }

  const requireActive = (operation) => {
    if (state !== 'active') {
      throw new Error(`cannot ${operation} when the performance renderer metric capture is ${state}`);
    }
  };

  return Object.freeze({
    adapterId: adapter.adapterId,
    target: Object.freeze({ ...adapter.target }),
    async beginWindow() {
      requireActive('begin the metric window');
      return cadenceCapture.beginWindow();
    },
    async sampleInWindow() {
      requireActive('sample the metric window');
      return cadenceCapture.sampleInWindow();
    },
    markTerminalClosure(terminalClosureEnd) {
      requireActive('mark metric terminal closure');
      return cadenceCapture.markTerminalClosure(terminalClosureEnd);
    },
    async sampleTerminalClosure() {
      requireActive('sample metric terminal closure');
      return cadenceCapture.sampleTerminalClosure();
    },
    getNextSampleTargetAt() {
      requireActive('read the next metric sample target');
      return cadenceCapture.getNextSampleTargetAt();
    },
    getAudit() {
      return cadenceCapture.getAudit();
    },
    async finalize() {
      requireActive('finalize the metric capture');
      state = 'finalizing';
      try {
        const transcript = await cadenceCapture.detach();
        const sessionClosure = await adapter.session.close();
        state = 'closed';
        return Object.freeze({ ...transcript, sessionClosure });
      } catch (error) {
        state = 'failed';
        await rethrowAfterMetricCleanup(
          error,
          () => adapter.session.abort(),
          'performance renderer metric capture finalization'
        );
      }
    },
    async abort() {
      if (state !== 'active') {
        throw new Error(`cannot abort the performance renderer metric capture when it is ${state}`);
      }
      state = 'aborting';
      try {
        const result = await cadenceCapture.abort();
        state = 'aborted';
        return result;
      } catch (error) {
        state = 'failed';
        throw error;
      }
    }
  });
}

/**
 * Opens one disposable performance application. Pair execution uses this
 * directly so two cold launches can share one external metric session; the
 * Playwright fixture below remains the single-launch convenience surface.
 *
 * @param {{
 *   performanceVariant?: 'production' | 'harness-control' | 'instrumented',
 *   performanceDiagnostics?: boolean,
 *   loadedManifest?: Awaited<ReturnType<typeof loadPerformanceBuildManifest>>,
 *   launchElectron?: typeof electron.launch
 * }} options
 */
export async function openPerformanceLaunch({
  performanceVariant = 'instrumented',
  performanceDiagnostics = true,
  loadedManifest = undefined,
  launchElectron = electron.launch.bind(electron)
} = {}) {
  if (!['production', 'harness-control', 'instrumented'].includes(performanceVariant)) {
    throw new Error('performance launch variant is invalid');
  }
  if (typeof performanceDiagnostics !== 'boolean' || typeof launchElectron !== 'function') {
    throw new Error('performance launch options are invalid');
  }
  const manifest = loadedManifest ?? await loadPerformanceBuildManifest();
  const build = getPerformanceBuild(manifest, performanceVariant);
  const launchId = build.harness ? createPerformanceLaunchId() : null;
  const externalExecutionId = createExternalPerformanceExecutionId();
  const userDataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'prismgb-performance-'));
  const launch = createPerformanceElectronLaunchOptions({
    build,
    launchId,
    userDataDirectory,
    performanceDiagnostics
  });
  let app = null;
  let window = null;
  let performanceMeasurement = null;
  let rootProcessId = null;
  let closed = false;
  let rootExitEvidence = null;
  const close = async () => {
    if (closed) return rootExitEvidence;
    closed = true;
    if (window) {
      await removeExternalPerformanceSentinelGate(window, externalExecutionId).catch(() => {});
    }
    if (window && build.harness && launchId !== null) {
      await removePerformanceControlProbe(window).catch(() => {});
    }
    let closeError = null;
    try {
      if (app) await app.close();
      if (build.harness && launch.rootExitAuditPath !== null) {
        if (performanceMeasurement !== null && rootProcessId !== null) {
          await waitForObservedProcessTermination({ pid: rootProcessId });
        }
        try {
          const rootExitAudit = await readPerformanceRootExitAudit({
            auditPath: launch.rootExitAuditPath,
            instrumentation: build.instrumentation
          });
          if (rootProcessId !== null && rootExitAudit.controllerAudit.rootExitGate.root.pid !== rootProcessId) {
            throw new Error('performance root-exit audit root PID does not match the launched Browser process');
          }
          rootExitEvidence = Object.freeze({
            controllerAudit: rootExitAudit.controllerAudit,
            rootExit: await observePerformanceRootExit({ rootExitAudit })
          });
        } catch (error) {
          const auditIsOptional = performanceMeasurement === null && error?.code === 'ENOENT';
          if (!auditIsOptional) throw error;
        }
      }
      if (performanceMeasurement !== null && rootExitEvidence === null) {
        throw new Error('planned harness launch closed without root-exit closure evidence');
      }
    } catch (error) {
      closeError = error;
    } finally {
      await fs.rm(userDataDirectory, { recursive: true, force: true });
    }
    if (closeError !== null) throw closeError;
    return rootExitEvidence;
  };

  try {
    app = await launchElectron({ ...launch, timeout: 60000 });
    if (build.harness && process.env.PRISMGB_PERFORMANCE_PAIR_PLAN) {
      performanceMeasurement = await openPerformanceMeasurementLease(app, launchId);
    }
    window = await app.firstWindow();
    await new AppShellPage(window).waitForReady();
    await installExternalPerformanceSentinelGate(window, externalExecutionId);
    const rendererPid = await readElectronRendererProcessId(app);
    const commonLaunch = {
      app,
      window,
      sourceSha: manifest.manifest.sourceSha,
      build,
      externalExecutionId,
      rendererPid,
      close,
      resolveRendererMetricTarget: () => resolvePerformanceRendererMetricTarget({
        rendererPid,
        externalExecutionId
      }),
      openRendererMetricCapture: () => openPerformanceRendererMetricCapture({
        rendererPid,
        externalExecutionId
      }),
      pausePerformanceCallbacks: () => pauseExternalPerformanceSentinelCallbacks(window, externalExecutionId),
      pausePerformanceCallbacksAt: (callbackCount) => pauseExternalPerformanceSentinelCallbacksAt(
        window,
        externalExecutionId,
        callbackCount
      ),
      resetPerformanceCallbacks: () => resetExternalPerformanceSentinelGate(window, externalExecutionId),
      armPerformanceCallbackWindow: (limits) => armExternalPerformanceSentinelWindow(
        window,
        externalExecutionId,
        limits
      ),
      resumePerformanceCallbacks: () => resumeExternalPerformanceSentinelCallbacks(window, externalExecutionId),
      sealPerformanceCallbacks: () => sealExternalPerformanceSentinelGate(window, externalExecutionId),
      readPerformanceCallbackGate: () => readExternalPerformanceSentinelGate(window, externalExecutionId)
    };
    if (!build.harness) return Object.freeze(commonLaunch);

    const marker = await window.evaluate(() => window.prismgbPerformanceLaunchMarker);
    if (marker?.launchId !== launchId) throw new Error('renderer marker does not match the launch controller identity');
    const controllerIdentity = await assertPerformanceController(app, launchId);
    rootProcessId = controllerIdentity.mainPid;
    await installPerformanceControlProbe(window, launchId);
    if (performanceMeasurement !== null) {
      await performanceMeasurement.recordStartupEnvironment();
      await performanceMeasurement.advance('qualification-probe');
    }
    return Object.freeze({
      ...commonLaunch,
      launchId,
      performanceMeasurement,
      readPerformanceControlProbe: () => readPerformanceControlProbe(window),
      resetPerformanceControlProbe: () => resetPerformanceControlProbe(window),
      readPerformanceDiagnostics: () => {
        if (!build.instrumentation) {
          throw new Error('renderer diagnostics require an instrumented performance build');
        }
        return readPerformanceDiagnostics(window, launchId);
      },
      resetPerformanceDiagnostics: () => {
        if (!build.instrumentation) {
          throw new Error('renderer diagnostics require an instrumented performance build');
        }
        return resetPerformanceDiagnostics(window, launchId);
      }
    });
  } catch (error) {
    await close().catch(() => {});
    throw error;
  }
}

export const test = base.extend({
  performanceVariant: ['instrumented', { option: true }],
  performanceDiagnostics: [true, { option: true }],

  performanceLaunch: async ({ performanceVariant, performanceDiagnostics }, use) => {
    const performanceLaunch = await openPerformanceLaunch({ performanceVariant, performanceDiagnostics });
    try {
      await use(performanceLaunch);
    } finally {
      await performanceLaunch.close();
    }
  },

  performanceChromaticDevice: async ({ performanceLaunch }, use) => {
    const chromaticDevice = new ChromaticDeviceFixture(performanceLaunch.app, performanceLaunch.window);
    try {
      await use(chromaticDevice);
    } finally {
      await chromaticDevice.cleanup();
    }
  }
});

export { expect } from '@playwright/test';
