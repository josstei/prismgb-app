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
  for (const phase of phases) {
    record('begin-phase', { phase });
    if (phase === 'measurement' && instrumentation) record('open-numeric-epoch', { measurementEpochId: launchId });
    for (const [samplePhase, purpose] of samples.filter(([samplePhase]) => samplePhase === phase)) {
      sample(samplePhase, purpose);
    }
    if (phase === 'measurement' && instrumentation) {
      record('close-numeric-epoch', { closedAt: sequence + 1, callSequence: ++callSequence });
    }
    if (phase === 'startup' || phase === 'pre-exit') environment(phase);
  }
  record('finalize', { disposedAt: sequence + 1 });

  return {
    launchId,
    requestLog,
    brokerSamples,
    environmentSamples,
    environmentEvents: [],
    fatalReasons: [],
    finalPhase: 'pre-exit',
    listenerEvidence: [{ eventType: 'app:gpu-info-update', removed: true }],
    restorationOutcome: 'restored',
    disposedAt: 100
  };
}
