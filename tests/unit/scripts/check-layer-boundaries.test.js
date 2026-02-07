import path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeLayerBoundaries } from '../../../scripts/check-layer-boundaries.js';

const fixturesRoot = path.resolve(
  process.cwd(),
  'tests/fixtures/layer-boundaries'
);

function runFixture(name) {
  return analyzeLayerBoundaries({
    projectRoot: path.join(fixturesRoot, name)
  });
}

describe('check-layer-boundaries script', () => {
  it('accepts a valid fixture without violations', () => {
    const report = runFixture('pass-basic');
    expect(report.violations).toHaveLength(0);
  });

  it('flags alias imports from renderer/infrastructure to renderer/presentation', () => {
    const report = runFixture('infra-imports-presentation-alias');
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0]).toMatchObject({
      sourceLayer: 'renderer/infrastructure',
      targetLayer: 'renderer/presentation'
    });
  });

  it('flags relative imports from renderer/infrastructure to renderer/presentation', () => {
    const report = runFixture('infra-imports-presentation-relative');
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0]).toMatchObject({
      sourceLayer: 'renderer/infrastructure',
      targetLayer: 'renderer/presentation'
    });
  });

  it('flags dynamic imports from renderer/presentation to main', () => {
    const report = runFixture('presentation-imports-main-dynamic');
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0]).toMatchObject({
      sourceLayer: 'renderer/presentation',
      targetLayer: 'main/infrastructure'
    });
  });

  it('flags re-exports from shared to renderer', () => {
    const report = runFixture('shared-reexports-renderer');
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0]).toMatchObject({
      sourceLayer: 'shared',
      targetLayer: 'renderer/presentation'
    });
  });
});
