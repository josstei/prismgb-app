#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import {
  analyzeLayerBoundaries,
  classifyFileLayer,
  getImportSpecifiers,
  resolveTargetLayer,
  walkCodeFiles
} from './check-layer-boundaries.js';

const RUNTIME_LAYER_PREFIXES = ['main', 'renderer', 'preload'];
const DEFAULT_TOP_FILES = 10;

function parseCliArgs(argv) {
  const options = {
    top: DEFAULT_TOP_FILES,
    output: null
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
  const absolutePath = path.isAbsolute(outputPath)
    ? outputPath
    : path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(scorecard, null, 2)}\n`);
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

function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const projectRoot = process.cwd();
  const srcRoot = path.join(projectRoot, 'src');
  const boundaryAnalysis = analyzeLayerBoundaries({ projectRoot });

  const scorecard = {
    generatedAt: new Date().toISOString(),
    metrics: {
      ...collectImportMetrics({ srcRoot }),
      tsStrictness: readTsStrictness(projectRoot),
      any: collectAnyMetrics(srcRoot),
      topRuntimeFiles: collectTopRuntimeFiles({ srcRoot, top: options.top }),
      boundaryViolationCount: boundaryAnalysis.violations.length
    }
  };

  printSummary(scorecard);

  if (options.output) {
    const outputPath = writeScorecardOutput(options.output, scorecard);
    console.log(`- wrote scorecard json: ${outputPath}`);
  }
}

main();
