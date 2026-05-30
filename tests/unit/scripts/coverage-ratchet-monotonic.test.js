import { describe, it, expect } from 'vitest';
import { checkMonotonic, findExpiredWaivers } from '../../../scripts/coverage-ratchet.js';

const baseTarget = (overrides = {}) => ({
  id: 'shared-node',
  minimums: { lines: 86, statements: 86, functions: 84, branches: 80 },
  ...overrides
});

const thresholds = (targets, defaultMinimums = { lines: 70, statements: 70, functions: 70, branches: 60 }) => ({
  defaultMinimums,
  targets
});

describe('checkMonotonic', () => {
  it('allows raising a minimum (no violation)', () => {
    const previous = thresholds([baseTarget()]);
    const current = thresholds([baseTarget({ minimums: { lines: 90, statements: 86, functions: 84, branches: 80 } })]);
    const violations = checkMonotonic({ previous, current, waivers: [], asOfDate: '2026-06-01' });
    expect(violations).toEqual([]);
  });

  it('flags a lowering with no covering waiver', () => {
    const previous = thresholds([baseTarget()]);
    const current = thresholds([baseTarget({ minimums: { lines: 70, statements: 86, functions: 84, branches: 80 } })]);
    const violations = checkMonotonic({ previous, current, waivers: [], asOfDate: '2026-06-01' });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ target: 'shared-node', metric: 'lines', previous: 86, current: 70 });
  });

  it('allows a lowering covered by an unexpired waiver', () => {
    const previous = thresholds([baseTarget()]);
    const current = thresholds([baseTarget({ minimums: { lines: 70, statements: 86, functions: 84, branches: 80 } })]);
    const waivers = [{ target: 'shared-node', metric: 'lines', from: 86, to: 70, owner: 'platform:shared', reason: 'pre-existing debt', expiresOn: '2026-09-30' }];
    const violations = checkMonotonic({ previous, current, waivers, asOfDate: '2026-06-01' });
    expect(violations).toEqual([]);
  });

  it('flags a lowering whose waiver has expired', () => {
    const previous = thresholds([baseTarget()]);
    const current = thresholds([baseTarget({ minimums: { lines: 70, statements: 86, functions: 84, branches: 80 } })]);
    const waivers = [{ target: 'shared-node', metric: 'lines', from: 86, to: 70, owner: 'platform:shared', reason: 'debt', expiresOn: '2026-05-01' }];
    const violations = checkMonotonic({ previous, current, waivers, asOfDate: '2026-06-01' });
    expect(violations).toHaveLength(1);
    expect(violations[0].metric).toBe('lines');
  });

  it('flags a lowering that goes below what the waiver authorizes', () => {
    const previous = thresholds([baseTarget()]);
    const current = thresholds([baseTarget({ minimums: { lines: 60, statements: 86, functions: 84, branches: 80 } })]);
    const waivers = [{ target: 'shared-node', metric: 'lines', from: 86, to: 70, owner: 'platform:shared', reason: 'debt', expiresOn: '2026-09-30' }];
    const violations = checkMonotonic({ previous, current, waivers, asOfDate: '2026-06-01' });
    expect(violations).toHaveLength(1);
    expect(violations[0].current).toBe(60);
  });

  it('ignores a newly-added target with no previous counterpart', () => {
    const previous = thresholds([baseTarget()]);
    const current = thresholds([baseTarget(), { id: 'new-scope', minimums: { lines: 50, statements: 50, functions: 50, branches: 40 } }]);
    const violations = checkMonotonic({ previous, current, waivers: [], asOfDate: '2026-06-01' });
    expect(violations).toEqual([]);
  });

  it('catches a sneaky lowering of defaultMinimums affecting an effective floor', () => {
    const previous = thresholds([{ id: 'main-preload', minimums: { lines: 42 } }], { lines: 70, statements: 70, functions: 70, branches: 60 });
    const current = thresholds([{ id: 'main-preload', minimums: { lines: 42 } }], { lines: 70, statements: 70, functions: 70, branches: 50 });
    const violations = checkMonotonic({ previous, current, waivers: [], asOfDate: '2026-06-01' });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ target: 'main-preload', metric: 'branches', previous: 60, current: 50 });
  });

  it('flags deleting a whole target as a REMOVED-gate violation (no laxer default rescues it)', () => {
    const previous = thresholds([baseTarget()], { lines: 50, statements: 50, functions: 50, branches: 40 });
    const current = thresholds([], { lines: 50, statements: 50, functions: 50, branches: 40 });
    const violations = checkMonotonic({ previous, current, waivers: [], asOfDate: '2026-06-01' });
    const lines = violations.find((v) => v.metric === 'lines');
    expect(lines).toMatchObject({ target: 'shared-node', metric: 'lines', previous: 86, current: 50 });
    expect(violations.length).toBeGreaterThanOrEqual(4);
  });

  it('treats a waiver missing `to` as non-covering (fail-closed)', () => {
    const previous = thresholds([baseTarget()]);
    const current = thresholds([baseTarget({ minimums: { lines: 70, statements: 86, functions: 84, branches: 80 } })]);
    const waivers = [{ target: 'shared-node', metric: 'lines', from: 86, owner: 'x', reason: 'malformed', expiresOn: '2026-09-30' }];
    const violations = checkMonotonic({ previous, current, waivers, asOfDate: '2026-06-01' });
    expect(violations).toHaveLength(1);
    expect(violations[0].metric).toBe('lines');
  });
});

describe('findExpiredWaivers', () => {
  const waiver = (expiresOn) => ({ target: 'shared-node', metric: 'lines', to: 70, expiresOn });

  it('returns nothing when all waivers are unexpired', () => {
    expect(findExpiredWaivers([waiver('2026-09-30'), waiver('2026-12-31')], '2026-06-01')).toEqual([]);
  });

  it('returns waivers whose expiresOn has passed as of the run date', () => {
    const expired = findExpiredWaivers([waiver('2026-05-01'), waiver('2026-12-31')], '2026-06-01');
    expect(expired).toHaveLength(1);
    expect(expired[0].expiresOn).toBe('2026-05-01');
  });
});
