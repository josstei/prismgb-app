import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  getInstalledPerformanceMeasurementController,
  installPerformanceMeasurementGuard,
  PERFORMANCE_MEASUREMENT_CONTROLLER_SYMBOL,
  type MeasurementEventSource,
  type PerformanceOperationToken
} from '@main/infrastructure/diagnostics/performance-measurement-guard';

const launchId = '6e3cc1a1-c341-4e20-9737-56ac2c4bd192';

function createEventSource(name: string, emitter: EventEmitter, events: readonly string[]): MeasurementEventSource {
  return {
    name,
    events,
    on: (event, listener) => emitter.on(event, listener),
    off: (event, listener) => emitter.off(event, listener)
  };
}

function completeOperationAfterStartup(
  controller: ReturnType<typeof installPerformanceMeasurementGuard>,
  operationToken: PerformanceOperationToken
) {
  const qualification = controller.beginPhase(operationToken, 'qualification-probe').phaseToken;
  controller.sample(qualification, 'qualification');
  const warmup = controller.beginPhase(operationToken, 'warmup').phaseToken;
  controller.sample(warmup, 'warmup');
  const measurement = controller.beginPhase(operationToken, 'measurement').phaseToken;
  const epoch = controller.openNumericEpoch(measurement, 'epoch-1').epochToken;
  controller.sample(epoch, 'measurement');
  controller.closeNumericEpoch(epoch);
  const submissionSeal = controller.beginPhase(operationToken, 'submission-seal').phaseToken;
  controller.sample(submissionSeal, 'submission-seal');
  const drain = controller.beginPhase(operationToken, 'drain').phaseToken;
  controller.sample(drain, 'drain');
  const shutdown = controller.beginPhase(operationToken, 'shutdown').phaseToken;
  controller.sample(shutdown, 'shutdown');
  const closure = controller.beginPhase(operationToken, 'application-descendant-closure').phaseToken;
  controller.sample(closure, 'application-descendant-closure');
  const preExit = controller.beginPhase(operationToken, 'pre-exit').phaseToken;
  controller.sample(preExit, 'pre-exit');
}

describe('PerformanceMeasurementController', () => {
  it('installs a non-enumerable marker-bound controller and records ordered broker and environment evidence', async () => {
    const globalTarget: Record<PropertyKey, unknown> = {};
    const power = new EventEmitter();
    const screen = new EventEmitter();
    let clock = 0;
    const controller = installPerformanceMeasurementGuard(launchId, {
      globalTarget,
      clock: () => ++clock,
      getAppMetrics: () => [{ pid: 1, type: 'Browser' }],
      getEnvironmentSnapshot: () => ({ power: 'ac', display: 'single' }),
      eventSources: [
        createEventSource('power', power, ['on-ac']),
        createEventSource('screen', screen, ['display-added'])
      ]
    });

    expect(Object.keys(globalTarget)).toEqual([]);
    expect(getInstalledPerformanceMeasurementController(launchId, globalTarget)).toBe(controller);

    controller.installEnvironmentListeners();
    power.emit('on-ac', { source: 'test' });
    screen.emit('display-added', { id: 1 });

    const { operationToken } = controller.beginOperation(launchId);
    const startup = controller.beginPhase(operationToken, 'startup').phaseToken;
    controller.sample(startup, 'startup-identity');
    const environment = await controller.sampleEnvironment(startup);
    expect(environment.currentState).toEqual({ power: 'ac', display: 'single' });
    expect(environment.eventBoundary).toEqual({ 'power:on-ac': 1, 'screen:display-added': 2 });

    completeOperationAfterStartup(controller, operationToken);

    const audit = controller.finalize(operationToken);
    expect(audit.brokerSamples).toHaveLength(9);
    expect(audit.environmentEvents).toHaveLength(2);
    expect(audit.listenerEvidence).toEqual([
      { eventType: 'power:on-ac', removed: true },
      { eventType: 'screen:display-added', removed: true }
    ]);
    expect(audit.restorationOutcome).toBe('restored');
    expect(globalTarget[PERFORMANCE_MEASUREMENT_CONTROLLER_SYMBOL]).toBeUndefined();
    expect(power.listenerCount('on-ac')).toBe(0);
    expect(screen.listenerCount('display-added')).toBe(0);
  });

  it('rejects wrong launch IDs, skipped phases, stale epoch tokens, and phase-incompatible purposes', () => {
    const globalTarget: Record<PropertyKey, unknown> = {};
    const controller = installPerformanceMeasurementGuard(launchId, {
      globalTarget,
      getAppMetrics: () => []
    });

    expect(() => controller.beginOperation('d8c1a4a1-c341-4e20-9737-56ac2c4bd192')).toThrow(/launch ID/);
    const { operationToken } = controller.beginOperation(launchId);
    expect(() => controller.beginPhase(operationToken, 'warmup')).toThrow(/expected phase startup/);

    const startup = controller.beginPhase(operationToken, 'startup').phaseToken;
    expect(() => controller.sample(startup, 'measurement')).toThrow(/not valid during startup/);
    const qualification = controller.beginPhase(operationToken, 'qualification-probe').phaseToken;
    const warmup = controller.beginPhase(operationToken, 'warmup').phaseToken;
    const measurement = controller.beginPhase(operationToken, 'measurement').phaseToken;
    const epoch = controller.openNumericEpoch(measurement, 'epoch-1').epochToken;
    controller.closeNumericEpoch(epoch);
    expect(() => controller.closeNumericEpoch(epoch)).toThrow(/no measurement numeric epoch is open/);
    expect(() => controller.sample(qualification, 'measurement')).toThrow(/sampling token/);
    expect(() => controller.sample(warmup, 'measurement')).toThrow(/sampling token/);
  });

  it('returns cached metrics without calling Electron and records the required fatal interference reason', () => {
    const globalTarget: Record<PropertyKey, unknown> = {};
    const getAppMetrics = vi.fn(() => [{ pid: 1 }]);
    const controller = installPerformanceMeasurementGuard(launchId, { globalTarget, getAppMetrics });
    const { operationToken } = controller.beginOperation(launchId);
    const startup = controller.beginPhase(operationToken, 'startup').phaseToken;
    controller.sample(startup, 'startup-identity');
    const cached = controller.sampleCached('startup-identity');
    expect(cached.servedFromCache).toBe(true);
    expect(getAppMetrics).toHaveBeenCalledTimes(1);

    const qualification = controller.beginPhase(operationToken, 'qualification-probe').phaseToken;
    controller.sample(qualification, 'qualification');
    const warmup = controller.beginPhase(operationToken, 'warmup').phaseToken;
    controller.sample(warmup, 'warmup');
    const measurement = controller.beginPhase(operationToken, 'measurement').phaseToken;
    const epoch = controller.openNumericEpoch(measurement, 'epoch-1').epochToken;
    controller.closeNumericEpoch(epoch);
    controller.beginPhase(operationToken, 'submission-seal');
    controller.beginPhase(operationToken, 'drain');
    controller.beginPhase(operationToken, 'shutdown');
    controller.beginPhase(operationToken, 'application-descendant-closure');
    controller.beginPhase(operationToken, 'pre-exit');

    expect(controller.finalize(operationToken).fatalReasons).toEqual(['unleased-public-metrics-interference']);
  });
});
