#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_SUMMARY_PATH = 'artifacts/coverage/coverage-summary.json';
const DEFAULT_THRESHOLD_PATH = 'scripts/coverage-thresholds.json';
const COVERAGE_METRICS = ['lines', 'statements', 'functions', 'branches'];
const VALID_MODES = new Set(['enforce', 'warning']);
const VALID_TARGET_MODES = new Set(['enforce', 'report-only']);

function parseArgs(argv) {
  const options = {
    summaryPath: DEFAULT_SUMMARY_PATH,
    thresholdPath: DEFAULT_THRESHOLD_PATH,
    reportOnly: false,
    asOfDate: getTodayIsoDate()
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--summary') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --summary.');
      }
      options.summaryPath = value;
      index += 1;
      continue;
    }

    if (arg === '--thresholds') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --thresholds.');
      }
      options.thresholdPath = value;
      index += 1;
      continue;
    }

    if (arg === '--as-of') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --as-of.');
      }
      ensureIsoDate(value, 'asOfDate');
      options.asOfDate = value;
      index += 1;
      continue;
    }

    if (arg === '--report-only') {
      options.reportOnly = true;
      continue;
    }
  }

  ensureIsoDate(options.asOfDate, 'asOfDate');
  return options;
}

function ensureIsoDate(value, fieldName) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ${fieldName} "${value}". Expected YYYY-MM-DD.`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid ${fieldName} "${value}". Expected a real calendar date.`);
  }
}

function getTodayIsoDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function normalizeRelativePath(value) {
  return value.split(path.sep).join('/');
}

function normalizeScope(scope) {
  return normalizeRelativePath(scope).replace(/^\.\//, '').replace(/\/+$/g, '');
}

function extractScopes(rawTarget, id) {
  const scopeValue = rawTarget.scope;
  const candidateScopes = Array.isArray(scopeValue)
    ? scopeValue
    : typeof scopeValue === 'string'
      ? [scopeValue]
      : Array.isArray(rawTarget.scopes)
        ? rawTarget.scopes
        : [];

  if (candidateScopes.length === 0) {
    throw new Error(`Coverage threshold target ${id} is missing "scope".`);
  }

  return candidateScopes.map((scope) => {
    if (typeof scope !== 'string' || scope.trim() === '') {
      throw new Error(`Coverage threshold target ${id} has invalid scope entry.`);
    }
    return normalizeScope(scope);
  });
}

function parseThresholdsFile(thresholdPath) {
  const absoluteThresholdPath = path.isAbsolute(thresholdPath)
    ? thresholdPath
    : path.resolve(process.cwd(), thresholdPath);
  const raw = fs.readFileSync(absoluteThresholdPath, 'utf8');
  return JSON.parse(raw);
}

function parseCoverageMinimums(rawMinimums, fieldName) {
  const minimums = rawMinimums === undefined ? {} : rawMinimums;
  if (minimums === null || typeof minimums !== 'object' || Array.isArray(minimums)) {
    throw new Error(`Invalid ${fieldName}; expected an object.`);
  }

  const parsed = {};

  for (const metric of COVERAGE_METRICS) {
    if (!Object.prototype.hasOwnProperty.call(minimums, metric)) {
      continue;
    }

    const value = minimums[metric];
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 100) {
      throw new Error(
        `Invalid ${fieldName}.${metric}: ${value}. `
          + 'Expected a number between 0 and 100.'
      );
    }

    parsed[metric] = value;
  }

  return parsed;
}

function parseTarget(rawTarget) {
  if (!rawTarget || typeof rawTarget !== 'object' || Array.isArray(rawTarget)) {
    throw new Error('Coverage threshold target entries must be objects.');
  }

  const { id } = rawTarget;
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error('Coverage threshold target is missing "id".');
  }

  if (!rawTarget.owner || typeof rawTarget.owner !== 'string' || rawTarget.owner.trim() === '') {
    throw new Error(`Coverage threshold target ${id} is missing "owner".`);
  }

  const normalizedScopes = extractScopes(rawTarget, id);
  const targetMode = rawTarget.mode || 'enforce';
  if (!VALID_TARGET_MODES.has(targetMode)) {
    throw new Error(`Invalid coverage target mode "${targetMode}" for ${id}.`);
  }

  const owner = rawTarget.owner.trim();
  const expiresOn = rawTarget.expiresOn;
  if (typeof expiresOn !== 'string' || expiresOn.trim() === '') {
    throw new Error(`Coverage threshold target ${id} is missing "expiresOn".`);
  }
  ensureIsoDate(expiresOn, `expiresOn for ${id}`);

  const minimums = parseCoverageMinimums(rawTarget.minimums, `minimums for ${id}`);
  return {
    id,
    owner,
    mode: targetMode,
    scopes: normalizedScopes,
    minimums,
    expiresOn: expiresOn.trim()
  };
}

function readCoverageThresholds(thresholdPath) {
  const payload = parseThresholdsFile(thresholdPath);
  const mode = payload.mode || 'warning';
  if (!VALID_MODES.has(mode)) {
    throw new Error(`Invalid threshold mode "${mode}". Expected "enforce" or "warning".`);
  }

  if (payload.version !== 1) {
    throw new Error('Coverage thresholds file missing supported "version": 1 payload.');
  }

  if (!Array.isArray(payload.targets)) {
    throw new Error('Coverage thresholds payload must include a "targets" array.');
  }

  const defaultMinimums = parseCoverageMinimums(payload.defaultMinimums, 'defaultMinimums');
  const targets = payload.targets.map(parseTarget);

  return {
    absolutePath: path.resolve(process.cwd(), thresholdPath),
    mode,
    defaultMinimums,
    targets,
    generatedAt: payload.generatedAt || null
  };
}

function parseCoverageThresholds(thresholdPath) {
  return readCoverageThresholds(thresholdPath);
}

function parseCoverageSummary(summaryPath) {
  const absoluteSummaryPath = path.isAbsolute(summaryPath)
    ? summaryPath
    : path.resolve(process.cwd(), summaryPath);
  const raw = fs.readFileSync(absoluteSummaryPath, 'utf8');
  return JSON.parse(raw);
}

function normalizeCoveragePath(filePath, projectRoot) {
  if (filePath === 'total') {
    return null;
  }

  if (path.isAbsolute(filePath)) {
    return normalizeRelativePath(path.relative(projectRoot, filePath));
  }

  return normalizeRelativePath(filePath);
}

function targetMatchesPath(target, relativeFilePath) {
  const scopes = Array.isArray(target.scopes) ? target.scopes : extractScopes(target, target.id);
  return scopes.some((scope) => {
    if (scope === '*') {
      return true;
    }

    return relativeFilePath === scope || relativeFilePath.startsWith(`${scope}/`);
  });
}

function aggregateCoverage(targets, summary, projectRoot) {
  const aggregateById = new Map();
  for (const target of targets) {
    const scopes = Array.isArray(target.scopes) ? target.scopes : extractScopes(target, target.id);
    aggregateById.set(target.id, {
      id: target.id,
      owner: target.owner,
      fileCount: 0,
      metrics: {
        lines: { total: 0, covered: 0 },
        statements: { total: 0, covered: 0 },
        functions: { total: 0, covered: 0 },
        branches: { total: 0, covered: 0 }
      },
      scope: scopes.slice()
    });
  }

  for (const [filePath, fileCoverage] of Object.entries(summary)) {
    if (filePath === 'total' || !fileCoverage || typeof fileCoverage !== 'object') {
      continue;
    }

    const normalizedPath = normalizeCoveragePath(filePath, projectRoot);
    if (!normalizedPath) {
      continue;
    }

    for (const target of targets) {
      if (!targetMatchesPath(target, normalizedPath)) {
        continue;
      }

      const bucket = aggregateById.get(target.id);
      if (!bucket) {
        continue;
      }

      bucket.fileCount += 1;
      for (const metric of COVERAGE_METRICS) {
        const metricCoverage = fileCoverage[metric];
        if (!metricCoverage) {
          continue;
        }

        const total = Number(metricCoverage.total);
        const covered = Number(metricCoverage.covered);
        if (!Number.isFinite(total) || !Number.isFinite(covered)) {
          continue;
        }

        bucket.metrics[metric].total += total;
        bucket.metrics[metric].covered += covered;
      }
    }
  }

  return aggregateById;
}

function computeMetricPct(total, covered) {
  if (total <= 0) {
    return 100;
  }
  return (covered / total) * 100;
}

function hasMinimums(minimums) {
  return Object.keys(minimums).length > 0;
}

function hasPositiveMinimums(minimums) {
  return Object.values(minimums).some((value) => Number(value) > 0);
}

function evaluateCoverageRatchet(summary, thresholds, options = {}) {
  const projectRoot = options.projectRoot || process.cwd();
  const asOfDate = options.asOfDate || getTodayIsoDate();
  const normalizedTargets = thresholds.targets.map((target) => ({
    id: target.id,
    owner: target.owner,
    mode: target.mode || 'enforce',
    scopes: Array.isArray(target.scopes) ? target.scopes : extractScopes(target, target.id),
    minimums: target.minimums || {},
    expiresOn: target.expiresOn
  }));
  const aggregateById = aggregateCoverage(normalizedTargets, summary, projectRoot);

  const results = [];
  const failures = [];

  for (const target of normalizedTargets) {
    const aggregate = aggregateById.get(target.id);
    if (!aggregate) {
      throw new Error(`Internal mismatch: missing aggregate bucket for target ${target.id}.`);
    }

    ensureIsoDate(target.expiresOn, `expiresOn for ${target.id}`);
    const minimums = { ...thresholds.defaultMinimums, ...target.minimums };
    const shouldEnforceTarget = target.mode !== 'report-only';
    const metrics = {};
    const passedMetrics = [];
    const failedMetrics = [];

    const expired = target.expiresOn < asOfDate;
    if (expired) {
      failures.push({
        target: target.id,
        owner: target.owner,
        type: 'expired',
        message: `Coverage threshold for ${target.id} expired on ${target.expiresOn}.`
      });
    }

    for (const metric of COVERAGE_METRICS) {
      const metricAggregate = aggregate.metrics[metric];
      const actual = computeMetricPct(metricAggregate.total, metricAggregate.covered);
      metrics[metric] = {
        total: metricAggregate.total,
        covered: metricAggregate.covered,
        pct: actual
      };

      if (!Object.prototype.hasOwnProperty.call(minimums, metric)) {
        continue;
      }

      const minimum = minimums[metric];
      if (!hasMinimums(minimums) || minimum === undefined) {
        continue;
      }

      if (actual + 0.0001 < minimum) {
        failedMetrics.push({
          metric,
          actual,
          minimum
        });
      } else {
        passedMetrics.push(metric);
      }
    }

    if (shouldEnforceTarget && aggregate.fileCount === 0 && hasPositiveMinimums(minimums)) {
      failures.push({
        target: target.id,
        owner: target.owner,
        type: 'missing-data',
        message: `Coverage target ${target.id} has no matching files in the current coverage artifact.`
      });
    }

    if (shouldEnforceTarget) {
      for (const failure of failedMetrics) {
        failures.push({
          target: target.id,
          owner: target.owner,
          type: 'coverage-regression',
          metric: failure.metric,
          actual: failure.actual,
          minimum: failure.minimum,
          message: `Coverage target ${target.id} ${failure.metric}=${failure.actual.toFixed(2)} `
            + `< minimum ${failure.minimum}.`
        });
      }
    }

    results.push({
      target: target.id,
      owner: target.owner,
      mode: target.mode,
      scopes: aggregate.scope,
      fileCount: aggregate.fileCount,
      metrics,
      passes: (!shouldEnforceTarget || failedMetrics.length === 0) && !expired,
      passedMetrics,
      failedMetrics
    });
  }

  return {
    asOfDate,
    results,
    failures,
    passed: failures.length === 0,
    mode: thresholds.mode
  };
}

function printRatchetSummary(evaluation) {
  console.log('Coverage Ratchet');
  for (const result of evaluation.results) {
    console.log(`- ${result.target} (${result.owner}, ${result.mode})`);
    console.log(`  - matched files: ${result.fileCount}`);
    for (const metric of COVERAGE_METRICS) {
      const value = result.metrics[metric];
      console.log(
        `  - ${metric}: ${value.total === 0 ? 'n/a' : `${value.pct.toFixed(2)}%`}`
          + ` (covered ${value.covered}/${value.total})`
      );
    }
  }

  if (evaluation.failures.length === 0) {
    console.log('All coverage thresholds satisfied.');
    return;
  }

  console.error(`Coverage threshold failures: ${evaluation.failures.length}`);
  for (const failure of evaluation.failures) {
    console.error(`- ${failure.target} (${failure.owner}): ${failure.message}`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const thresholds = readCoverageThresholds(options.thresholdPath);
  const summary = parseCoverageSummary(options.summaryPath);
  const evaluation = evaluateCoverageRatchet(summary, thresholds, {
    projectRoot: process.cwd(),
    asOfDate: options.asOfDate
  });

  printRatchetSummary(evaluation);

  const shouldEnforce = thresholds.mode === 'enforce' && !options.reportOnly;
  if (shouldEnforce && !evaluation.passed) {
    process.exit(1);
  }
}

const invokedScript = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : '';
if (import.meta.url === invokedScript) {
  main();
}

export {
  computeMetricPct,
  ensureIsoDate,
  getTodayIsoDate,
  parseArgs,
  parseCoverageMinimums,
  parseCoverageThresholds,
  parseCoverageSummary,
  readCoverageThresholds,
  targetMatchesPath,
  evaluateCoverageRatchet
};
