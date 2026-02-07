#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import {
  analyzeLayerBoundaries,
  classifyFileLayer,
  getImportSpecifiers,
  resolveTargetLayer,
  walkCodeFiles
} from './check-layer-boundaries.js';

const RUNTIME_LAYER_PREFIXES = ['main', 'renderer', 'preload'];
const DEFAULT_TOP_FILES = 10;
const DEFAULT_THRESHOLDS_PATH = 'scripts/architecture-thresholds.json';

export function parseCliArgs(argv) {
  const options = {
    top: DEFAULT_TOP_FILES,
    output: null,
    enforceThresholds: false,
    thresholdsPath: DEFAULT_THRESHOLDS_PATH,
    summaryOutput: null
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--top') {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error('Invalid --top value. Expected a positive integer.');
      }
      options.top = value;
      index += 1;
      continue;
    }

    if (arg === '--output') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --output.');
      }
      options.output = value;
      index += 1;
      continue;
    }

    if (arg === '--enforce-thresholds') {
      options.enforceThresholds = true;
      continue;
    }

    if (arg === '--thresholds') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --thresholds.');
      }
      options.thresholdsPath = value;
      index += 1;
      continue;
    }

    if (arg === '--summary-output') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --summary-output.');
      }
      options.summaryOutput = value;
      index += 1;
    }
  }

  return options;
}

function countLines(sourceCode) {
  if (!sourceCode) {
    return 0;
  }
  return sourceCode.split(/\r?\n/).length;
}

function collectImportMetrics({ srcRoot }) {
  const files = walkCodeFiles(srcRoot);
  let infraToPresentationImportCount = 0;
  let crossProcessImportCount = 0;

  for (const filePath of files) {
    const sourceLayer = classifyFileLayer(filePath, srcRoot);
    if (!sourceLayer) {
      continue;
    }

    const sourceCode = fs.readFileSync(filePath, 'utf8');
    const specifiers = getImportSpecifiers(sourceCode);

    for (const specifier of specifiers) {
      const targetLayer = resolveTargetLayer(specifier, filePath, srcRoot);
      if (!targetLayer) {
        continue;
      }

      if (
        sourceLayer === 'renderer/infrastructure'
        && targetLayer === 'renderer/presentation'
      ) {
        infraToPresentationImportCount += 1;
      }

      const sourceIsMain = sourceLayer.startsWith('main/');
      const sourceIsRenderer = sourceLayer.startsWith('renderer/');
      const targetIsMain = targetLayer.startsWith('main/');
      const targetIsRenderer = targetLayer.startsWith('renderer/');
      if ((sourceIsMain && targetIsRenderer) || (sourceIsRenderer && targetIsMain)) {
        crossProcessImportCount += 1;
      }
    }
  }

  return {
    infraToPresentationImportCount,
    crossProcessImportCount
  };
}

function readTsStrictness(projectRoot) {
  const tsconfigPath = path.join(projectRoot, 'tsconfig.app.json');
  const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
  const compilerOptions = tsconfig.compilerOptions || {};
  return {
    strict: Boolean(compilerOptions.strict),
    noImplicitAny: Boolean(compilerOptions.noImplicitAny),
    strictNullChecks: Boolean(compilerOptions.strictNullChecks)
  };
}

function collectAnyMetrics(srcRoot) {
  const files = walkCodeFiles(srcRoot).filter((filePath) => filePath.endsWith('.ts'));
  const entries = [];
  let occurrenceCount = 0;

  for (const filePath of files) {
    const sourceCode = fs.readFileSync(filePath, 'utf8');
    const matches = sourceCode.match(/\bany\b/g) || [];
    if (matches.length === 0) {
      continue;
    }

    occurrenceCount += matches.length;
    entries.push({
      file: normalizeRelativePath(path.relative(srcRoot, filePath)),
      count: matches.length
    });
  }

  entries.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return a.file.localeCompare(b.file);
  });

  return {
    occurrenceCount,
    filesWithAnyCount: entries.length,
    totalTsFiles: files.length,
    files: entries
  };
}

function normalizeRelativePath(value) {
  return value.split(path.sep).join('/');
}

function collectTopRuntimeFiles({ srcRoot, top }) {
  const files = walkCodeFiles(srcRoot);
  const entries = [];

  for (const filePath of files) {
    const relativePath = normalizeRelativePath(path.relative(srcRoot, filePath));
    if (!RUNTIME_LAYER_PREFIXES.some((prefix) => relativePath.startsWith(`${prefix}/`))) {
      continue;
    }

    const sourceCode = fs.readFileSync(filePath, 'utf8');
    entries.push({
      file: `src/${relativePath}`,
      loc: countLines(sourceCode)
    });
  }

  entries.sort((a, b) => {
    if (b.loc !== a.loc) {
      return b.loc - a.loc;
    }
    return a.file.localeCompare(b.file);
  });

  return entries.slice(0, top);
}

function writeScorecardOutput(outputPath, scorecard) {
  return writeTextOutput(outputPath, `${JSON.stringify(scorecard, null, 2)}\n`);
}

function writeTextOutput(outputPath, text) {
  const absolutePath = path.isAbsolute(outputPath)
    ? outputPath
    : path.resolve(process.cwd(), outputPath);

  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, text);
  return absolutePath;
}

function printSummary(scorecard) {
  const { metrics } = scorecard;
  console.log('Architecture Scorecard');
  console.log(`- infra->presentation imports: ${metrics.infraToPresentationImportCount}`);
  console.log(`- cross-process imports: ${metrics.crossProcessImportCount}`);
  console.log(
    `- ts strictness: strict=${metrics.tsStrictness.strict}, `
    + `noImplicitAny=${metrics.tsStrictness.noImplicitAny}, `
    + `strictNullChecks=${metrics.tsStrictness.strictNullChecks}`
  );
  console.log(
    `- any occurrences: ${metrics.any.occurrenceCount} `
    + `across ${metrics.any.filesWithAnyCount} files`
  );
  console.log(`- boundary violations: ${metrics.boundaryViolationCount}`);
  console.log('- top runtime files:');
  for (const entry of metrics.topRuntimeFiles) {
    console.log(`  - ${entry.file}: ${entry.loc}`);
  }
}

function ensureBooleanLimit(value, key) {
  if (typeof value !== 'boolean') {
    throw new Error(`Threshold ${key} must be a boolean.`);
  }
}

function ensureNonNegativeIntegerLimit(value, key) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Threshold ${key} must be a non-negative integer.`);
  }
}

function readThresholdConfig(projectRoot, thresholdsPath) {
  const absolutePath = path.isAbsolute(thresholdsPath)
    ? thresholdsPath
    : path.resolve(projectRoot, thresholdsPath);

  const config = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  const limits = config.limits || {};

  const checks = [
    ['boundaryViolationCount', ensureNonNegativeIntegerLimit],
    ['infraToPresentationImportCount', ensureNonNegativeIntegerLimit],
    ['crossProcessImportCount', ensureNonNegativeIntegerLimit],
    ['strict', ensureBooleanLimit],
    ['noImplicitAny', ensureBooleanLimit],
    ['strictNullChecks', ensureBooleanLimit],
    ['anyOccurrenceCountMax', ensureNonNegativeIntegerLimit],
    ['topRuntimeFileLocMax', ensureNonNegativeIntegerLimit]
  ];

  for (const [key, validator] of checks) {
    if (Object.prototype.hasOwnProperty.call(limits, key)) {
      validator(limits[key], key);
    }
  }

  return {
    absolutePath,
    mode: typeof config.mode === 'string' ? config.mode : 'warning',
    limits
  };
}

function evaluateThreshold(metric, actual, expected, comparator) {
  const passed = comparator === 'max'
    ? actual <= expected
    : actual === expected;
  const relation = comparator === 'max' ? '<=' : '===';

  return {
    metric,
    expected,
    actual,
    comparator,
    passed,
    message: `${metric}: actual ${actual} ${relation} expected ${expected}`
  };
}

export function evaluateThresholds(metrics, limits) {
  const checks = [];
  const addCheck = (limitKey, metricName, actualValue, comparator) => {
    if (!Object.prototype.hasOwnProperty.call(limits, limitKey)) {
      return;
    }
    checks.push(evaluateThreshold(metricName, actualValue, limits[limitKey], comparator));
  };

  addCheck('boundaryViolationCount', 'boundaryViolationCount', metrics.boundaryViolationCount, 'max');
  addCheck(
    'infraToPresentationImportCount',
    'infraToPresentationImportCount',
    metrics.infraToPresentationImportCount,
    'max'
  );
  addCheck('crossProcessImportCount', 'crossProcessImportCount', metrics.crossProcessImportCount, 'max');
  addCheck('strict', 'tsStrictness.strict', metrics.tsStrictness.strict, 'equals');
  addCheck('noImplicitAny', 'tsStrictness.noImplicitAny', metrics.tsStrictness.noImplicitAny, 'equals');
  addCheck(
    'strictNullChecks',
    'tsStrictness.strictNullChecks',
    metrics.tsStrictness.strictNullChecks,
    'equals'
  );
  addCheck('anyOccurrenceCountMax', 'any.occurrenceCount', metrics.any.occurrenceCount, 'max');
  addCheck(
    'topRuntimeFileLocMax',
    'topRuntimeFiles[0].loc',
    metrics.topRuntimeFiles[0]?.loc ?? 0,
    'max'
  );

  const failures = checks.filter((check) => !check.passed);
  return {
    checks,
    failures,
    passed: failures.length === 0
  };
}

function printThresholdSummary(config, evaluation) {
  console.log(`- threshold mode: ${config.mode}`);
  console.log(`- threshold checks: ${evaluation.passed ? 'pass' : 'fail'}`);

  if (evaluation.failures.length > 0) {
    console.error('Threshold failures:');
    for (const failure of evaluation.failures) {
      console.error(`  - ${failure.message}`);
    }
  }
}

function renderScorecardSummary(scorecard, thresholdConfig, thresholdEvaluation) {
  const { metrics } = scorecard;
  const lines = [
    '# Architecture Scorecard',
    '',
    `Generated at: ${scorecard.generatedAt}`,
    '',
    '## Metrics',
    `- boundary violations: ${metrics.boundaryViolationCount}`,
    `- infra->presentation imports: ${metrics.infraToPresentationImportCount}`,
    `- cross-process imports: ${metrics.crossProcessImportCount}`,
    `- ts strictness: strict=${metrics.tsStrictness.strict}, `
      + `noImplicitAny=${metrics.tsStrictness.noImplicitAny}, `
      + `strictNullChecks=${metrics.tsStrictness.strictNullChecks}`,
    `- any occurrences: ${metrics.any.occurrenceCount} `
      + `across ${metrics.any.filesWithAnyCount} files`,
    '',
    '## Top Runtime Files',
    '| File | LOC |',
    '| --- | ---: |'
  ];

  if (metrics.topRuntimeFiles.length === 0) {
    lines.push('| _(none)_ | 0 |');
  } else {
    for (const entry of metrics.topRuntimeFiles) {
      lines.push(`| ${entry.file} | ${entry.loc} |`);
    }
  }

  if (thresholdConfig && thresholdEvaluation) {
    lines.push('');
    lines.push('## Thresholds');
    lines.push(`- mode: ${thresholdConfig.mode}`);
    lines.push(`- result: ${thresholdEvaluation.passed ? 'pass' : 'fail'}`);
    if (thresholdEvaluation.failures.length === 0) {
      lines.push('- all configured thresholds satisfied.');
    } else {
      lines.push('- failing checks:');
      for (const failure of thresholdEvaluation.failures) {
        lines.push(`  - ${failure.message}`);
      }
    }
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function generateScorecard({ projectRoot = process.cwd(), top = DEFAULT_TOP_FILES } = {}) {
  const srcRoot = path.join(projectRoot, 'src');
  const boundaryAnalysis = analyzeLayerBoundaries({ projectRoot });
  return {
    generatedAt: new Date().toISOString(),
    metrics: {
      ...collectImportMetrics({ srcRoot }),
      tsStrictness: readTsStrictness(projectRoot),
      any: collectAnyMetrics(srcRoot),
      topRuntimeFiles: collectTopRuntimeFiles({ srcRoot, top }),
      boundaryViolationCount: boundaryAnalysis.violations.length
    }
  };
}

function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const projectRoot = process.cwd();
  const scorecard = generateScorecard({
    projectRoot,
    top: options.top
  });

  printSummary(scorecard);

  if (options.output) {
    const outputPath = writeScorecardOutput(options.output, scorecard);
    console.log(`- wrote scorecard json: ${outputPath}`);
  }

  let thresholdConfig = null;
  let thresholdEvaluation = null;
  if (options.enforceThresholds) {
    thresholdConfig = readThresholdConfig(projectRoot, options.thresholdsPath);
    thresholdEvaluation = evaluateThresholds(scorecard.metrics, thresholdConfig.limits);
    printThresholdSummary(thresholdConfig, thresholdEvaluation);
  }

  if (options.summaryOutput) {
    const summaryPath = writeTextOutput(
      options.summaryOutput,
      renderScorecardSummary(scorecard, thresholdConfig, thresholdEvaluation)
    );
    console.log(`- wrote scorecard summary: ${summaryPath}`);
  }

  if (options.enforceThresholds && thresholdEvaluation && !thresholdEvaluation.passed) {
    process.exit(1);
  }
}

const invokedScript = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedScript) {
  main();
}
