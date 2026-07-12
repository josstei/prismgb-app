const phases = [
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

const samples = [
  ['startup', 'startup-identity'],
  ['qualification-probe', 'qualification'],
  ['warmup', 'warmup'],
  ['warmup', 'prime'],
  ['measurement', 'measurement'],
  ['submission-seal', 'submission-seal'],
  ['drain', 'drain'],
  ['shutdown', 'shutdown'],
  ['shutdown', 'post-release-settle'],
  ['application-descendant-closure', 'application-descendant-closure'],
  ['pre-exit', 'pre-exit']
] as const;

export function createPerformanceControllerAuditFixture({
  launchId,
  instrumentation
}: {
  launchId: string;
  instrumentation: boolean;
}) {
  let sequence = 0;
  let callSequence = 0;
  const requestLog: Array<Record<string, unknown>> = [];
  const brokerSamples: Array<Record<string, unknown>> = [];
  const environmentSamples: Array<Record<string, unknown>> = [];
  const record = (event: string, details: Record<string, unknown> = {}) => {
    requestLog.push({ sequence: ++sequence, event, at: sequence, ...details });
  };
  const sample = (phase: string, purpose: string) => {
    const sampleCallSequence = ++callSequence;
    brokerSamples.push({
      launchId,
      callSequence: sampleCallSequence,
      phase,
      purpose,
      capturedAt: sampleCallSequence,
      rawAppMetrics: [{ pid: 1, type: 'Browser' }],
      servedFromCache: false
    });
    record('sample', { phase, purpose, callSequence: sampleCallSequence });
    return sampleCallSequence;
  };
  const environment = (phase: 'startup' | 'pre-exit') => {
    const environmentCallSequence = ++callSequence;
    environmentSamples.push({
      launchId,
      callSequence: environmentCallSequence,
      phase,
      capturedAt: environmentCallSequence,
      currentState: { gpu: 'available' },
      eventBoundary: {}
    });
    record('sample-environment', { phase, callSequence: environmentCallSequence });
  };

  record('install-environment-listeners', { count: 1 });
  record('begin-operation', { launchId });
  let postReleaseSettle: {
    purpose: 'post-release-settle';
    releaseDispatchedReceiptAt: number;
    notBeforeFixtureAt: number;
    sampledFixtureAt: number;
    brokerCallSequence: number;
  } | null = null;
  for (const phase of phases) {
    record('begin-phase', { phase });
    if (phase === 'measurement' && instrumentation) record('open-numeric-epoch', { measurementEpochId: launchId });
    for (const [samplePhase, purpose] of samples.filter(([samplePhase]) => samplePhase === phase)) {
      if (purpose === 'post-release-settle') {
        const releaseDispatchedReceiptAt = 100;
        const notBeforeFixtureAt = 1_100;
        record('record-release-dispatched', { releaseDispatchedReceiptAt, notBeforeFixtureAt });
        const brokerCallSequence = sample(samplePhase, purpose);
        postReleaseSettle = {
          purpose,
          releaseDispatchedReceiptAt,
          notBeforeFixtureAt,
          sampledFixtureAt: notBeforeFixtureAt,
          brokerCallSequence
        };
        record('sample-post-release-settle', {
          purpose,
          sampledFixtureAt: postReleaseSettle.sampledFixtureAt,
          brokerCallSequence
        });
      } else {
        sample(samplePhase, purpose);
      }
    }
    if (phase === 'measurement' && instrumentation) {
      record('close-numeric-epoch', { closedAt: sequence + 1, callSequence: ++callSequence });
    }
    if (phase === 'startup' || phase === 'pre-exit') environment(phase);
  }
  record('finalize', { disposedAt: sequence + 1 });
  if (postReleaseSettle === null) throw new Error('performance controller audit fixture did not record post-release settle evidence');

  return {
    launchId,
    requestLog,
    brokerSamples,
    environmentSamples,
    environmentEvents: [],
    postReleaseSettle,
    fatalReasons: [],
    finalPhase: 'pre-exit',
    listenerEvidence: [{ eventType: 'app:gpu-info-update', removed: true }],
    restorationOutcome: 'restored',
    disposedAt: 100
  };
}
