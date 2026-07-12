const performanceMeasurementControllerSymbol: unique symbol = Symbol.for(
  'prismgb.performance.measurementController'
) as never;

export { performanceMeasurementControllerSymbol as PERFORMANCE_MEASUREMENT_CONTROLLER_SYMBOL };

const PHASES = [
  'startup',
  'qualification-probe',
  'warmup',
  'measurement',
  'submission-seal',
  'drain',
  'shutdown',
  'application-descendant-closure',
  'pre-exit'
] as const;

export type PerformanceMeasurementPhase = (typeof PHASES)[number];
export type PerformanceMeasurementPurpose =
  | 'startup-identity'
  | 'qualification'
  | 'warmup'
  | 'prime'
  | 'measurement'
  | 'submission-seal'
  | 'drain'
  | 'shutdown'
  | 'application-descendant-closure'
  | 'pre-exit'
  | 'post-release-settle';

type OpaqueToken = Readonly<{
  readonly nonce: string;
}>;

export type PerformanceOperationToken = OpaqueToken;
export type PerformancePhaseToken = OpaqueToken;
export type PerformanceEpochToken = OpaqueToken;

export type BrokerSample = Readonly<{
  readonly launchId: string;
  readonly callSequence: number;
  readonly phase: PerformanceMeasurementPhase;
  readonly purpose: PerformanceMeasurementPurpose;
  readonly capturedAt: number;
  readonly rawAppMetrics: unknown;
  readonly servedFromCache: boolean;
}>;

export type EnvironmentEvent = Readonly<{
  readonly sourceSequence: number;
  readonly clockDomain: 'electron-main';
  readonly observedAt: number;
  readonly eventType: string;
  readonly rawPayload: unknown;
  readonly normalizedState: unknown;
}>;

export type EnvironmentSample = Readonly<{
  readonly launchId: string;
  readonly callSequence: number;
  readonly phase: PerformanceMeasurementPhase;
  readonly capturedAt: number;
  readonly currentState: unknown;
  readonly eventBoundary: Readonly<Record<string, number>>;
}>;

export type PostReleaseSettleAudit = Readonly<{
  readonly purpose: 'post-release-settle';
  readonly releaseDispatchedReceiptAt: number;
  readonly notBeforeFixtureAt: number;
  readonly sampledFixtureAt: number;
  readonly brokerCallSequence: number;
}>;

export type MeasurementAudit = Readonly<{
  readonly launchId: string;
  readonly requestLog: readonly Readonly<Record<string, unknown>>[];
  readonly brokerSamples: readonly BrokerSample[];
  readonly environmentSamples: readonly EnvironmentSample[];
  readonly environmentEvents: readonly EnvironmentEvent[];
  readonly postReleaseSettle: PostReleaseSettleAudit;
  readonly fatalReasons: readonly string[];
  readonly finalPhase: PerformanceMeasurementPhase;
  readonly listenerEvidence: readonly Readonly<{ readonly eventType: string; readonly removed: boolean }>[];
  readonly restorationOutcome: 'restored';
  readonly disposedAt: number;
}>;

export type MeasurementEventSource = Readonly<{
  readonly name: string;
  readonly on: (event: string, listener: (...args: unknown[]) => void) => unknown;
  readonly off: (event: string, listener: (...args: unknown[]) => void) => unknown;
  readonly events: readonly string[];
}>;

export type PerformanceMeasurementGuardOptions = Readonly<{
  readonly getAppMetrics: () => unknown;
  readonly getEnvironmentSnapshot?: () => unknown | Promise<unknown>;
  readonly eventSources?: readonly MeasurementEventSource[];
  readonly clock?: () => number;
  readonly globalTarget?: Record<PropertyKey, unknown>;
}>;

type OperationState = {
  readonly token: PerformanceOperationToken;
  phaseIndex: number;
  activeEpoch: { readonly token: PerformanceEpochToken; readonly measurementEpochId: string } | null;
};

type PendingPostReleaseSettle = Readonly<{
  readonly releaseDispatchedReceiptAt: number;
  readonly notBeforeFixtureAt: number;
}>;

const purposesByPhase: Readonly<Record<PerformanceMeasurementPhase, readonly PerformanceMeasurementPurpose[]>> = {
  startup: ['startup-identity'],
  'qualification-probe': ['qualification'],
  warmup: ['warmup', 'prime'],
  measurement: ['measurement'],
  'submission-seal': ['submission-seal'],
  drain: ['drain'],
  shutdown: ['shutdown'],
  'application-descendant-closure': ['application-descendant-closure'],
  'pre-exit': ['pre-exit']
};

function fail(message: string): never {
  throw new Error(`Performance measurement guard rejected operation: ${message}`);
}

function makeNonce(prefix: string, ordinal: number): string {
  return `${prefix}:${ordinal}:${Math.random().toString(36).slice(2)}`;
}

function freezeToken(nonce: string): OpaqueToken {
  return Object.freeze({ nonce });
}

function currentPhase(state: OperationState): PerformanceMeasurementPhase {
  return PHASES[state.phaseIndex];
}

function requireFixtureClockTimestamp(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    fail(`${label} must be a finite monotonic timestamp`);
  }
}

/**
 * A launch-local broker used only by compiled harness builds.  Its tokens are
 * opaque capabilities: callers can pass them back to the controller, but cannot
 * change phase or launch ownership by constructing a look-alike object.
 */
export class PerformanceMeasurementController {
  private readonly launchId: string;
  private readonly getAppMetrics: () => unknown;
  private readonly getEnvironmentSnapshot: () => unknown | Promise<unknown>;
  private readonly clock: () => number;
  private readonly globalTarget: Record<PropertyKey, unknown>;
  private readonly eventSources: readonly MeasurementEventSource[];
  private readonly operationTokens = new Set<string>();
  private readonly phaseTokens = new Map<string, PerformanceMeasurementPhase>();
  private readonly epochTokens = new Map<string, { readonly phaseToken: string; readonly measurementEpochId: string }>();
  private readonly listeners: Array<{
    readonly eventType: string;
    readonly source: MeasurementEventSource;
    readonly listener: (...args: unknown[]) => void;
    removed: boolean;
  }> = [];
  private operation: OperationState | null = null;
  private finalized = false;
  private sequence = 0;
  private sourceSequence = 0;
  private readonly requestLog: Array<Readonly<Record<string, unknown>>> = [];
  private readonly brokerSamples: BrokerSample[] = [];
  private readonly environmentSamples: EnvironmentSample[] = [];
  private readonly environmentEvents: EnvironmentEvent[] = [];
  private readonly fatalReasons: string[] = [];
  private lastBrokerSample: BrokerSample | null = null;
  private environmentListenersInstalled = false;
  private pendingPostReleaseSettle: PendingPostReleaseSettle | null = null;
  private postReleaseSettle: PostReleaseSettleAudit | null = null;

  constructor(launchId: string, options: PerformanceMeasurementGuardOptions) {
    if (launchId.length === 0) fail('launch ID must be nonempty');
    this.launchId = launchId;
    this.getAppMetrics = options.getAppMetrics;
    this.getEnvironmentSnapshot = options.getEnvironmentSnapshot ?? (() => null);
    this.clock = options.clock ?? (() => performance.now());
    this.globalTarget = options.globalTarget ?? (globalThis as Record<PropertyKey, unknown>);
    this.eventSources = options.eventSources ?? [];
  }

  installEnvironmentListeners(): void {
    this.assertLive();
    if (this.environmentListenersInstalled) fail('environment listeners are already installed');
    this.environmentListenersInstalled = true;
    for (const source of this.eventSources) {
      for (const eventType of source.events) {
        const listener = (...args: unknown[]) => {
          this.environmentEvents.push(Object.freeze({
            sourceSequence: ++this.sourceSequence,
            clockDomain: 'electron-main',
            observedAt: this.clock(),
            eventType: `${source.name}:${eventType}`,
            rawPayload: args,
            normalizedState: null
          }));
        };
        source.on(eventType, listener);
        this.listeners.push({ eventType: `${source.name}:${eventType}`, source, listener, removed: false });
      }
    }
    this.record('install-environment-listeners', { count: this.listeners.length });
  }

  install(): void {
    if (Object.prototype.hasOwnProperty.call(this.globalTarget, performanceMeasurementControllerSymbol)) {
      fail('a measurement controller is already installed');
    }
    Object.defineProperty(this.globalTarget, performanceMeasurementControllerSymbol, {
      configurable: true,
      enumerable: false,
      writable: false,
      value: this
    });
  }

  beginOperation(launchId: string): Readonly<{ readonly operationToken: PerformanceOperationToken }> {
    this.assertLive();
    if (launchId !== this.launchId) fail('operation launch ID does not match the installed marker');
    if (this.operation !== null) fail('an operation is already active');
    const token = freezeToken(makeNonce('operation', ++this.sequence));
    this.operationTokens.add(token.nonce);
    this.operation = { token, phaseIndex: -1, activeEpoch: null };
    this.record('begin-operation', { launchId });
    return Object.freeze({ operationToken: token });
  }

  beginPhase(
    operationToken: PerformanceOperationToken,
    phase: PerformanceMeasurementPhase
  ): Readonly<{ readonly phaseToken: PerformancePhaseToken }> {
    const operation = this.requireOperation(operationToken);
    if (operation.activeEpoch !== null) fail('cannot transition while a numeric epoch is open');
    const expectedIndex = operation.phaseIndex + 1;
    if (PHASES[expectedIndex] !== phase) {
      fail(`expected phase ${PHASES[expectedIndex] ?? 'none'}, received ${phase}`);
    }
    if (phase === 'application-descendant-closure' && this.postReleaseSettle === null) {
      fail('application descendant closure requires a completed post-release settle sample');
    }
    operation.phaseIndex = expectedIndex;
    const token = freezeToken(makeNonce(`phase:${phase}`, ++this.sequence));
    this.phaseTokens.set(token.nonce, phase);
    this.record('begin-phase', { phase });
    return Object.freeze({ phaseToken: token });
  }

  openNumericEpoch(
    phaseToken: PerformancePhaseToken,
    measurementEpochId: string
  ): Readonly<{ readonly epochToken: PerformanceEpochToken }> {
    const operation = this.requireOperationForPhaseToken(phaseToken, 'measurement');
    if (operation.activeEpoch !== null) fail('a numeric epoch is already open');
    if (measurementEpochId.length === 0) fail('measurement epoch ID must be nonempty');
    const token = freezeToken(makeNonce(`epoch:${measurementEpochId}`, ++this.sequence));
    this.epochTokens.set(token.nonce, { phaseToken: phaseToken.nonce, measurementEpochId });
    operation.activeEpoch = { token, measurementEpochId };
    this.record('open-numeric-epoch', { measurementEpochId });
    return Object.freeze({ epochToken: token });
  }

  sample(token: PerformancePhaseToken | PerformanceEpochToken, purpose: PerformanceMeasurementPurpose): BrokerSample {
    const operation = this.requireSamplingToken(token);
    const phase = currentPhase(operation);
    if (!purposesByPhase[phase].includes(purpose)) {
      fail(`purpose ${purpose} is not valid during ${phase}`);
    }
    return this.captureBrokerSample(phase, purpose);
  }

  recordReleaseDispatched(
    phaseToken: PerformancePhaseToken,
    releaseDispatchedReceiptAt: number
  ): Readonly<{ readonly notBeforeFixtureAt: number }> {
    this.requireOperationForPhaseToken(phaseToken, 'shutdown');
    if (this.pendingPostReleaseSettle !== null || this.postReleaseSettle !== null) {
      fail('release-dispatched boundary has already been recorded');
    }
    requireFixtureClockTimestamp(releaseDispatchedReceiptAt, 'release-dispatched fixture receipt');
    const notBeforeFixtureAt = releaseDispatchedReceiptAt + 1_000;
    if (!Number.isFinite(notBeforeFixtureAt)) {
      fail('release-dispatched fixture receipt is too large to derive a settle deadline');
    }
    this.pendingPostReleaseSettle = Object.freeze({ releaseDispatchedReceiptAt, notBeforeFixtureAt });
    this.record('record-release-dispatched', { releaseDispatchedReceiptAt, notBeforeFixtureAt });
    return Object.freeze({ notBeforeFixtureAt });
  }

  samplePostReleaseSettle(
    phaseToken: PerformancePhaseToken,
    sampledFixtureAt: number
  ): BrokerSample {
    this.requireOperationForPhaseToken(phaseToken, 'shutdown');
    const pending = this.pendingPostReleaseSettle;
    if (pending === null || this.postReleaseSettle !== null) {
      fail('post-release settle requires one recorded release-dispatched boundary');
    }
    requireFixtureClockTimestamp(sampledFixtureAt, 'post-release settle fixture sample');
    if (sampledFixtureAt < pending.notBeforeFixtureAt) {
      fail('post-release settle sample arrived before its one-second fixture deadline');
    }
    const sample = this.captureBrokerSample('shutdown', 'post-release-settle');
    const postReleaseSettle = Object.freeze({
      purpose: 'post-release-settle' as const,
      releaseDispatchedReceiptAt: pending.releaseDispatchedReceiptAt,
      notBeforeFixtureAt: pending.notBeforeFixtureAt,
      sampledFixtureAt,
      brokerCallSequence: sample.callSequence
    });
    this.pendingPostReleaseSettle = null;
    this.postReleaseSettle = postReleaseSettle;
    this.record('sample-post-release-settle', {
      purpose: postReleaseSettle.purpose,
      sampledFixtureAt: postReleaseSettle.sampledFixtureAt,
      brokerCallSequence: postReleaseSettle.brokerCallSequence
    });
    return sample;
  }

  private captureBrokerSample(
    phase: PerformanceMeasurementPhase,
    purpose: PerformanceMeasurementPurpose
  ): BrokerSample {
    const capturedAt = this.clock();
    const rawAppMetrics = this.getAppMetrics();
    const sample = Object.freeze({
      launchId: this.launchId,
      callSequence: ++this.sequence,
      phase,
      purpose,
      capturedAt,
      rawAppMetrics,
      servedFromCache: false
    });
    this.lastBrokerSample = sample;
    this.brokerSamples.push(sample);
    this.record('sample', { purpose, phase, callSequence: sample.callSequence });
    return sample;
  }

  sampleCached(purpose: PerformanceMeasurementPurpose): BrokerSample {
    this.assertLive();
    if (this.lastBrokerSample === null) fail('cannot serve an unleased metrics request before the first broker sample');
    const operation = this.requireActiveOperation();
    const phase = currentPhase(operation);
    const sample = Object.freeze({
      ...this.lastBrokerSample,
      callSequence: ++this.sequence,
      phase,
      purpose,
      capturedAt: this.clock(),
      servedFromCache: true
    });
    this.brokerSamples.push(sample);
    this.fatalReasons.push('unleased-public-metrics-interference');
    this.record('unleased-public-metrics-interference', { purpose, phase, callSequence: sample.callSequence });
    return sample;
  }

  async sampleEnvironment(token: PerformancePhaseToken | PerformanceEpochToken): Promise<EnvironmentSample> {
    const operation = this.requireSamplingToken(token);
    const sample = Object.freeze({
      launchId: this.launchId,
      callSequence: ++this.sequence,
      phase: currentPhase(operation),
      capturedAt: this.clock(),
      currentState: await this.getEnvironmentSnapshot(),
      eventBoundary: Object.freeze(this.environmentEvents.reduce<Record<string, number>>((boundary, event) => {
        boundary[event.eventType] = event.sourceSequence;
        return boundary;
      }, {}))
    });
    this.environmentSamples.push(sample);
    this.record('sample-environment', { phase: sample.phase, callSequence: sample.callSequence });
    return sample;
  }

  closeNumericEpoch(epochToken: PerformanceEpochToken): Readonly<{ readonly closedAt: number; readonly callSequence: number }> {
    const operation = this.requireActiveOperation();
    if (currentPhase(operation) !== 'measurement' || operation.activeEpoch === null) {
      fail('no measurement numeric epoch is open');
    }
    if (operation.activeEpoch.token.nonce !== epochToken.nonce || !this.epochTokens.has(epochToken.nonce)) {
      fail('numeric epoch token is stale or belongs to another operation');
    }
    this.epochTokens.delete(epochToken.nonce);
    operation.activeEpoch = null;
    const closed = Object.freeze({ closedAt: this.clock(), callSequence: ++this.sequence });
    this.record('close-numeric-epoch', closed);
    return closed;
  }

  finalize(operationToken: PerformanceOperationToken): MeasurementAudit {
    const operation = this.requireOperation(operationToken);
    if (operation.activeEpoch !== null) fail('cannot finalize with a numeric epoch open');
    if (currentPhase(operation) !== 'pre-exit') fail('controller must reach pre-exit before finalization');
    if (this.pendingPostReleaseSettle !== null || this.postReleaseSettle === null) {
      fail('controller must complete the post-release settle sample before finalization');
    }
    this.finalized = true;
    for (const registration of this.listeners) {
      registration.source.off(registration.eventType.slice(registration.eventType.indexOf(':') + 1), registration.listener);
      registration.removed = true;
    }
    if (this.globalTarget[performanceMeasurementControllerSymbol] !== this) {
      fail('measurement controller global was replaced before finalization');
    }
    if (!delete this.globalTarget[performanceMeasurementControllerSymbol]) {
      fail('measurement controller global could not be restored');
    }
    const disposedAt = this.clock();
    this.record('finalize', { disposedAt });
    const audit = Object.freeze({
      launchId: this.launchId,
      requestLog: Object.freeze([...this.requestLog]),
      brokerSamples: Object.freeze([...this.brokerSamples]),
      environmentSamples: Object.freeze([...this.environmentSamples]),
      environmentEvents: Object.freeze([...this.environmentEvents]),
      postReleaseSettle: this.postReleaseSettle,
      fatalReasons: Object.freeze([...this.fatalReasons]),
      finalPhase: currentPhase(operation),
      listenerEvidence: Object.freeze(this.listeners.map(({ eventType, removed }) => Object.freeze({ eventType, removed }))),
      restorationOutcome: 'restored' as const,
      disposedAt
    });
    return audit;
  }

  assertLaunchId(launchId: string): void {
    this.assertLive();
    if (launchId !== this.launchId) fail('fixture launch ID does not match the controller marker');
  }

  private requireOperation(token: PerformanceOperationToken): OperationState {
    this.assertLive();
    const operation = this.requireActiveOperation();
    if (!this.operationTokens.has(token.nonce) || operation.token.nonce !== token.nonce) {
      fail('operation token is stale or belongs to another launch');
    }
    return operation;
  }

  private requireOperationForPhaseToken(token: PerformancePhaseToken, expectedPhase: PerformanceMeasurementPhase): OperationState {
    const operation = this.requireActiveOperation();
    if (this.phaseTokens.get(token.nonce) !== expectedPhase || currentPhase(operation) !== expectedPhase) {
      fail(`phase token is stale or is not for ${expectedPhase}`);
    }
    return operation;
  }

  private requireSamplingToken(token: PerformancePhaseToken | PerformanceEpochToken): OperationState {
    const operation = this.requireActiveOperation();
    const phase = currentPhase(operation);
    const expectedEpoch = operation.activeEpoch;
    if (expectedEpoch !== null) {
      if (token.nonce !== expectedEpoch.token.nonce || !this.epochTokens.has(token.nonce)) {
        fail('sampling token does not own the open numeric epoch');
      }
      return operation;
    }
    if (this.phaseTokens.get(token.nonce) !== phase) {
      fail('sampling token does not own the active phase');
    }
    return operation;
  }

  private requireActiveOperation(): OperationState {
    this.assertLive();
    if (this.operation === null) fail('no operation is active');
    return this.operation;
  }

  private assertLive(): void {
    if (this.finalized) fail('controller is already finalized');
  }

  private record(event: string, details: Readonly<Record<string, unknown>>): void {
    this.requestLog.push(Object.freeze({ sequence: ++this.sequence, event, at: this.clock(), ...details }));
  }
}

export function installPerformanceMeasurementGuard(
  launchId: string,
  options: PerformanceMeasurementGuardOptions
): PerformanceMeasurementController {
  const controller = new PerformanceMeasurementController(launchId, options);
  controller.install();
  return controller;
}

export function getInstalledPerformanceMeasurementController(
  launchId: string,
  globalTarget: Record<PropertyKey, unknown> = globalThis as Record<PropertyKey, unknown>
): PerformanceMeasurementController {
  const controller = globalTarget[performanceMeasurementControllerSymbol];
  if (!(controller instanceof PerformanceMeasurementController)) {
    fail('measurement controller is not installed');
  }
  controller.assertLaunchId(launchId);
  return controller;
}
