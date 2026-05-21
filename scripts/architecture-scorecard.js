#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { pathToFileURL } from 'url';
import * as ts from 'typescript';
import { getShaderDuplicateStatus } from './codebase-size-report.js';
import {
  analyzeLayerBoundaries,
  classifyFileLayer,
  getImportSpecifiers,
  resolveTargetLayer,
  walkCodeFiles
} from './check-layer-boundaries.js';
import { extractAliasKeysFromConfigSource } from './lib/alias-config.js';

const RUNTIME_LAYER_PREFIXES = ['main', 'renderer', 'preload'];
const DEFAULT_TOP_FILES = 10;
const DEFAULT_THRESHOLDS_PATH = 'scripts/architecture-thresholds.json';
const DEFAULT_IGNORE_ROOT_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  'release',
  'coverage',
  'artifacts',
  '.turbo'
]);
const DEFAULT_CONTRACT_PATTERNS = [
  /\.manifest\.(json|ts)$/,
  /\.contract\.(json|ts)$/,
  /channels\.json$/,
  /settings\.definitions\.json$/,
  /preload-api\.contract\.(ts|js|mjs)$/
];
const CANONICAL_CONTRACT_ALLOWLIST = [
  'src/shared/ipc/channels.json',
  'src/shared/ipc/ipc.manifest.json',
  'src/shared/ipc/ipc.manifest.ts',
  'src/shared/ipc/preload-api.contract.ts',
  'src/shared/events/event.manifest.json',
  'src/shared/events/event.manifest.ts',
  'src/shared/features/devices/device.manifest.json',
  'src/shared/features/devices/device.manifest.ts',
  'src/shared/features/settings/settings.definitions.json',
  'src/shared/features/settings/settings.definitions.ts',
  'packages/prismgb-gpu/src/domain/render-passes/render-passes.contract.json',
  'packages/prismgb-gpu/src/domain/render-passes/render-passes.contract.ts',
  'scripts/manifests/architecture.manifest.json',
  'scripts/manifests/platforms.manifest.json'
];
const FALLBACK_CANONICAL_PRELOAD_APIS = [
  'deviceAPI',
  'shellAPI',
  'windowAPI',
  'updateAPI',
  'transcodeAPI',
  'metricsAPI',
  'gpuAPI',
  'loginItemAPI'
];
const TS_ALIAS_KEY_PATTERN = /^(.+?)\s*\/\*$/;
const BUILD_MATRIX_SOURCES = [
  {
    name: 'release',
    args: ['--mode', 'release', '--platforms', 'all']
  },
  {
    name: 'smoke',
    args: ['--mode', 'smoke', '--platform', 'all']
  }
];
const SHARED_TYPESCRIPT_CUTOVER_ROOTS = [
  'src/shared/base',
  'src/shared/interfaces'
];

function readJson(projectRoot, relativePath) {
  const absolutePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function normalizeAliasKey(alias) {
  return alias.replace(TS_ALIAS_KEY_PATTERN, '$1');
}

function sortUniq(items) {
  return [...new Set(items)].sort();
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function normalizeRelativePath(value) {
  return toPosix(value);
}

function isContractLikeFile(filePath) {
  return DEFAULT_CONTRACT_PATTERNS.some((pattern) => pattern.test(filePath));
}

function walkFiles(rootPath, predicate) {
  const files = [];
  if (!fs.existsSync(rootPath)) {
    return files;
  }

  const walk = (currentPath) => {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (DEFAULT_IGNORE_ROOT_DIRECTORIES.has(entry.name)) {
        continue;
      }

      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (predicate(absolutePath)) {
        files.push(absolutePath);
      }
    }
  };

  walk(rootPath);
  return files;
}

function collectContractAllowlist() {
  return new Set(CANONICAL_CONTRACT_ALLOWLIST.map(normalizeRelativePath));
}

function collectContractLikeFiles(projectRoot) {
  const contractLikeFiles = [];
  const roots = ['src', 'scripts', 'packages'];

  for (const root of roots) {
    const rootPath = path.join(projectRoot, root);
    if (!fs.existsSync(rootPath)) {
      continue;
    }

    const files = walkFiles(rootPath, (absolutePath) => isContractLikeFile(absolutePath));
    for (const filePath of files) {
      contractLikeFiles.push(normalizeRelativePath(path.relative(projectRoot, filePath)));
    }
  }

  return sortUniq(contractLikeFiles);
}

function collectRuntimeFiles(projectRoot, includeFiles = []) {
  const roots = [
    path.join(projectRoot, 'src'),
    path.join(projectRoot, 'packages')
  ];

  const matches = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) {
      continue;
    }
    matches.push(...walkFiles(root, (absolutePath) => includeFiles.some((fileName) => absolutePath.endsWith(fileName))));
  }

  return matches;
}

export function collectContractMetrics(projectRoot) {
  const allowlist = collectContractAllowlist();
  const contractLikeFiles = collectContractLikeFiles(projectRoot);
  const unexpectedContractFiles = contractLikeFiles.filter((filePath) => !allowlist.has(filePath));

  return {
    totalContractLikeFiles: contractLikeFiles.length,
    unexpectedContractFileCount: unexpectedContractFiles.length,
    unexpectedContractFiles
  };
}

export function collectShaderDuplicateMetrics(projectRoot) {
  const shaderStatus = getShaderDuplicateStatus(projectRoot);
  const duplicateFiles = shaderStatus.pairs
    .filter((pair) => pair.rightFileCount > 0)
    .map((pair) => ({
      name: pair.name,
      source: pair.sourceB,
      fileCount: pair.rightFileCount,
      status: pair.status
    }));
  return {
    duplicatePairs: shaderStatus.pairs,
    divergentPairs: shaderStatus.pairs.filter((pair) => pair.status === 'diverged'),
    duplicateFiles,
    duplicateFileCount: duplicateFiles.reduce((sum, pair) => sum + pair.fileCount, 0),
    totalPairs: shaderStatus.pairs.length,
    divergentPairCount: shaderStatus.pairs.filter((pair) => pair.status === 'diverged').length
  };
}

export function collectRuntimeTwinMetrics(projectRoot) {
  const runtimeJsFiles = [];
  const runtimeDtsFiles = new Set();

  for (const filePath of collectRuntimeFiles(projectRoot, ['.js', '.d.ts'])) {
    if (filePath.endsWith('.js')) {
      runtimeJsFiles.push(filePath);
    } else if (filePath.endsWith('.d.ts')) {
      runtimeDtsFiles.add(filePath);
    }
  }

  const pairs = runtimeJsFiles
    .map((jsFilePath) => {
      const dtsPath = `${jsFilePath.slice(0, -3)}.d.ts`;
      if (!runtimeDtsFiles.has(dtsPath)) {
        return null;
      }

      return {
        jsFile: normalizeRelativePath(path.relative(projectRoot, jsFilePath)),
        dtsFile: normalizeRelativePath(path.relative(projectRoot, dtsPath))
      };
    })
    .filter(Boolean)
    .sort((left, right) => (left.jsFile > right.jsFile ? 1 : -1));

  return {
    pairCount: pairs.length,
    pairs
  };
}

export function collectSharedTypeScriptCutoverMetrics(projectRoot) {
  const files = SHARED_TYPESCRIPT_CUTOVER_ROOTS.flatMap((relativeRoot) => {
    const absoluteRoot = path.join(projectRoot, relativeRoot);
    return walkFiles(
      absoluteRoot,
      (absolutePath) => absolutePath.endsWith('.js') || absolutePath.endsWith('.d.ts')
    );
  })
    .map((filePath) => normalizeRelativePath(path.relative(projectRoot, filePath)))
    .sort();

  return {
    fileCount: files.length,
    files
  };
}

function collectCanonicalPreloadApis(projectRoot) {
  const ipcManifest = readJson(projectRoot, 'src/shared/ipc/ipc.manifest.json');
  const apiNames = Array.isArray(ipcManifest?.namespaces)
    ? ipcManifest.namespaces.map((namespace) => namespace.apiName).filter(Boolean)
    : FALLBACK_CANONICAL_PRELOAD_APIS;

  return sortUniq(apiNames);
}

function getPropertyName(node, sourceFile) {
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text;
  }

  if (ts.isElementAccessExpression(node)) {
    const argument = node.argumentExpression;
    if (argument && ts.isStringLiteralLike(argument)) {
      return argument.text;
    }
  }

  if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
    if (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)) {
      return node.name.text;
    }
  }

  return node.getText(sourceFile);
}

function isCanonicalWindowObjectExpression(node, sourceFile) {
  const text = node.getText(sourceFile);
  return text === 'window'
    || text === 'globalThis'
    || text === 'global.window'
    || text === 'globalThis.window';
}

function getCanonicalPreloadPropertyAccessName(node, sourceFile, apiNames) {
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    const apiName = getPropertyName(node, sourceFile);
    if (apiNames.has(apiName) && isCanonicalWindowObjectExpression(node.expression, sourceFile)) {
      return apiName;
    }
  }

  return null;
}

function isObjectStaticMethodCall(node, methodName, sourceFile) {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }

  return node.expression.getText(sourceFile) === `Object.${methodName}`
    || node.expression.getText(sourceFile) === `Reflect.${methodName}`;
}

function countCanonicalPreloadObjectLiteralProperties(node, sourceFile, apiNames) {
  if (!ts.isObjectLiteralExpression(node)) {
    return 0;
  }

  let count = 0;
  for (const property of node.properties) {
    const apiName = getPropertyName(property, sourceFile);
    if (apiNames.has(apiName)) {
      count += 1;
    }
  }
  return count;
}

function countCanonicalPreloadCallAssignments(node, sourceFile, apiNames) {
  if (!ts.isCallExpression(node)) {
    return 0;
  }

  const [target, propertyName, descriptor] = node.arguments;
  if (!target || !isCanonicalWindowObjectExpression(target, sourceFile)) {
    return 0;
  }

  if (isObjectStaticMethodCall(node, 'assign', sourceFile)) {
    return node.arguments
      .slice(1)
      .reduce(
        (sum, argument) => sum + countCanonicalPreloadObjectLiteralProperties(argument, sourceFile, apiNames),
        0
      );
  }

  if (
    isObjectStaticMethodCall(node, 'defineProperty', sourceFile)
    && propertyName
    && ts.isStringLiteralLike(propertyName)
    && apiNames.has(propertyName.text)
  ) {
    return 1;
  }

  if (
    isObjectStaticMethodCall(node, 'defineProperties', sourceFile)
    && propertyName
  ) {
    return countCanonicalPreloadObjectLiteralProperties(propertyName, sourceFile, apiNames);
  }

  return 0;
}

export function collectInlineMockAssignments(projectRoot) {
  const testsRoot = path.join(projectRoot, 'tests');
  if (!fs.existsSync(testsRoot)) {
    return {
      inlineCanonicalMockAssignmentCount: 0,
      filesWithAssignments: []
    };
  }

  const apiNames = new Set(collectCanonicalPreloadApis(projectRoot));
  const filesWithAssignments = [];

  const files = walkFiles(testsRoot, (absolutePath) => absolutePath.endsWith('.ts') || absolutePath.endsWith('.js'));
  for (const filePath of files) {
    const source = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS
    );
    let count = 0;

    function visit(node) {
      if (ts.isBinaryExpression(node)) {
        const isAssignment = node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
          && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
        if (isAssignment) {
          if (getCanonicalPreloadPropertyAccessName(node.left, sourceFile, apiNames)) {
            count += 1;
          } else if (isCanonicalWindowObjectExpression(node.left, sourceFile)) {
            count += countCanonicalPreloadObjectLiteralProperties(node.right, sourceFile, apiNames);
          }
        }
      }

      if (
        ts.isDeleteExpression(node)
        && getCanonicalPreloadPropertyAccessName(node.expression, sourceFile, apiNames)
      ) {
        count += 1;
      }

      count += countCanonicalPreloadCallAssignments(node, sourceFile, apiNames);

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    if (count > 0) {
      filesWithAssignments.push({
        file: normalizeRelativePath(path.relative(projectRoot, filePath)),
        count
      });
    }
  }

  return {
    inlineCanonicalMockAssignmentCount: filesWithAssignments.reduce((sum, item) => sum + item.count, 0),
    filesWithAssignments
  };
}

function collectAliasManifestSet(projectRoot) {
  const manifest = readJson(projectRoot, 'scripts/manifests/architecture.manifest.json');
  const aliases = Array.isArray(manifest?.aliases)
    ? manifest.aliases.map((entry) => entry.id).filter(Boolean)
    : [];

  return new Set(sortUniq(aliases));
}

function compareAliasSet(source, configuredAliases, expectedAliases) {
  const configured = new Set(configuredAliases);
  const expected = new Set(expectedAliases);
  return {
    source,
    extras: sortUniq([...configured].filter((alias) => !expected.has(alias))),
    missing: sortUniq([...expected].filter((alias) => !configured.has(alias))),
    configuredAliases: sortUniq([...configured]),
    expectedAliases: sortUniq([...expected])
  };
}

function collectTsConfigAliases(projectRoot, configFileName) {
  const config = readJson(projectRoot, configFileName);
  const entries = Object.keys(config?.compilerOptions?.paths || {});
  return new Set(sortUniq(entries.map((entry) => normalizeAliasKey(entry))));
}

function collectJsAliasKeys(projectRoot, jsFileName) {
  const source = fs.readFileSync(path.join(projectRoot, jsFileName), 'utf8');
  return new Set(extractAliasKeysFromConfigSource(source, jsFileName).map((alias) => normalizeAliasKey(alias)));
}

export function collectAliasDriftMetrics(projectRoot) {
  const manifestAliases = collectAliasManifestSet(projectRoot);
  const nonRuntimeManifestAliases = new Set([...manifestAliases].filter((alias) => alias !== 'url'));
  const tsBaseAliases = collectTsConfigAliases(projectRoot, 'tsconfig.base.json');
  const tsAppAliases = collectTsConfigAliases(projectRoot, 'tsconfig.app.json');
  const viteAliases = collectJsAliasKeys(projectRoot, 'vite.config.js');
  const vitestAliases = collectJsAliasKeys(projectRoot, 'vitest.config.js');

  const sources = [
    compareAliasSet('tsconfig.base.json', tsBaseAliases, nonRuntimeManifestAliases),
    compareAliasSet('tsconfig.app.json', tsAppAliases, nonRuntimeManifestAliases),
    compareAliasSet('vite.config.js', viteAliases, manifestAliases),
    compareAliasSet('vitest.config.js', vitestAliases, nonRuntimeManifestAliases)
  ];
  const manifestExtras = sources.flatMap((entry) =>
    entry.extras.map((alias) => ({ source: entry.source, alias }))
  );
  const manifestMissing = sources.flatMap((entry) =>
    entry.missing.map((alias) => ({ source: entry.source, alias }))
  );
  const driftCount = manifestExtras.length + manifestMissing.length;

  return {
    driftCount,
    manifestExtras,
    manifestMissing,
    sources
  };
}

function collectBuildMatrixPlatforms(projectRoot, args) {
  const output = execFileSync(process.execPath, ['scripts/ci/build-matrix.mjs', ...args], {
    cwd: projectRoot,
    encoding: 'utf8'
  });
  const matrix = JSON.parse(output);
  return matrix.map((entry) => entry.label);
}

export function collectPlatformDriftMetrics(projectRoot) {
  const platformsManifest = readJson(projectRoot, 'scripts/manifests/platforms.manifest.json');
  const manifestLabels = new Set(
    (platformsManifest?.platforms || []).map((platform) => platform.label).filter(Boolean)
  );
  const sources = BUILD_MATRIX_SOURCES.map((source) => {
    const buildMatrixLabels = collectBuildMatrixPlatforms(projectRoot, source.args);
    const matrixSet = new Set(buildMatrixLabels);
    return {
      source: source.name,
      matrixExtras: sortUniq([...matrixSet].filter((entry) => !manifestLabels.has(entry))),
      manifestMissing: sortUniq([...manifestLabels].filter((label) => !matrixSet.has(label))),
      matrixLabelCount: matrixSet.size
    };
  });
  const matrixExtras = sources.flatMap((entry) =>
    entry.matrixExtras.map((label) => ({ source: entry.source, label }))
  );
  const manifestMissing = sources.flatMap((entry) =>
    entry.manifestMissing.map((label) => ({ source: entry.source, label }))
  );
  const driftCount = matrixExtras.length + manifestMissing.length;

  return {
    driftCount,
    matrixExtras,
    manifestMissing,
    manifestLabelCount: manifestLabels.size,
    sources
  };
}

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

export function countExplicitAnyKeywords(sourceCode, fileName = 'source.ts') {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  let count = 0;

  function visit(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      count += 1;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return count;
}

export function collectAnyMetrics(srcRoot) {
  const files = walkCodeFiles(srcRoot).filter((filePath) => filePath.endsWith('.ts'));
  const entries = [];
  let occurrenceCount = 0;

  for (const filePath of files) {
    const sourceCode = fs.readFileSync(filePath, 'utf8');
    const explicitAnyCount = countExplicitAnyKeywords(sourceCode, filePath);
    if (explicitAnyCount === 0) {
      continue;
    }

    occurrenceCount += explicitAnyCount;
    entries.push({
      file: normalizeRelativePath(path.relative(srcRoot, filePath)),
      count: explicitAnyCount
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
  console.log(`- unexpected contract-like files: ${metrics.unexpectedContractFileCount}`);
  console.log(`- shader duplicate divergence pairs: ${metrics.shaderDuplicateDivergenceCount}`);
  console.log(`- renderer shader duplicate files: ${metrics.shaderDuplicateFileCount}`);
  console.log(`- runtime js+d.ts twin count: ${metrics.runtimeJsDtsTwinCount}`);
  console.log(`- shared base/interface js+d.ts cutover leftovers: ${metrics.sharedBaseInterfaceJsOrDtsFileCount}`);
  console.log(`- inline canonical test mock assignments: ${metrics.inlineCanonicalMockAssignmentCount}`);
  console.log(`- alias manifest drift: ${metrics.aliasManifestDriftCount}`);
  console.log(`- platform manifest drift: ${metrics.platformManifestDriftCount}`);
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
    ['topRuntimeFileLocMax', ensureNonNegativeIntegerLimit],
    ['unexpectedContractFileCountMax', ensureNonNegativeIntegerLimit],
    ['shaderDuplicateDivergenceCountMax', ensureNonNegativeIntegerLimit],
    ['shaderDuplicateFileCountMax', ensureNonNegativeIntegerLimit],
    ['runtimeJsDtsTwinCountMax', ensureNonNegativeIntegerLimit],
    ['sharedBaseInterfaceJsOrDtsFileCountMax', ensureNonNegativeIntegerLimit],
    ['inlineCanonicalMockAssignmentCountMax', ensureNonNegativeIntegerLimit],
    ['aliasManifestDriftCountMax', ensureNonNegativeIntegerLimit],
    ['platformManifestDriftCountMax', ensureNonNegativeIntegerLimit]
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
  addCheck(
    'unexpectedContractFileCountMax',
    'unexpectedContractFileCount',
    metrics.unexpectedContractFileCount,
    'max'
  );
  addCheck(
    'shaderDuplicateDivergenceCountMax',
    'shaderDuplicateDivergenceCount',
    metrics.shaderDuplicateDivergenceCount,
    'max'
  );
  addCheck(
    'shaderDuplicateFileCountMax',
    'shaderDuplicateFileCount',
    metrics.shaderDuplicateFileCount,
    'max'
  );
  addCheck(
    'runtimeJsDtsTwinCountMax',
    'runtimeJsDtsTwinCount',
    metrics.runtimeJsDtsTwinCount,
    'max'
  );
  addCheck(
    'sharedBaseInterfaceJsOrDtsFileCountMax',
    'sharedBaseInterfaceJsOrDtsFileCount',
    metrics.sharedBaseInterfaceJsOrDtsFileCount,
    'max'
  );
  addCheck(
    'inlineCanonicalMockAssignmentCountMax',
    'inlineCanonicalMockAssignmentCount',
    metrics.inlineCanonicalMockAssignmentCount,
    'max'
  );
  addCheck(
    'aliasManifestDriftCountMax',
    'aliasManifestDriftCount',
    metrics.aliasManifestDriftCount,
    'max'
  );
  addCheck(
    'platformManifestDriftCountMax',
    'platformManifestDriftCount',
    metrics.platformManifestDriftCount,
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
  `- unexpected contract-like files: ${metrics.unexpectedContractFileCount}`,
  `- shader duplicate divergence pairs: ${metrics.shaderDuplicateDivergenceCount}`,
  `- renderer shader duplicate files: ${metrics.shaderDuplicateFileCount}`,
  `- runtime js+d.ts twin count: ${metrics.runtimeJsDtsTwinCount}`,
  `- shared base/interface js+d.ts cutover leftovers: ${metrics.sharedBaseInterfaceJsOrDtsFileCount}`,
  `- inline canonical mock assignments: ${metrics.inlineCanonicalMockAssignmentCount}`,
  `- alias manifest drift: ${metrics.aliasManifestDriftCount}`,
  `- platform manifest drift: ${metrics.platformManifestDriftCount}`,
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
  const contractOwnershipMetrics = collectContractMetrics(projectRoot);
  const shaderDuplicateMetrics = collectShaderDuplicateMetrics(projectRoot);
  const runtimeTwinMetrics = collectRuntimeTwinMetrics(projectRoot);
  const sharedTypeScriptCutoverMetrics = collectSharedTypeScriptCutoverMetrics(projectRoot);
  const inlineMockMetrics = collectInlineMockAssignments(projectRoot);
  const aliasDriftMetrics = collectAliasDriftMetrics(projectRoot);
  const platformDriftMetrics = collectPlatformDriftMetrics(projectRoot);
  return {
    generatedAt: new Date().toISOString(),
    metrics: {
      ...collectImportMetrics({ srcRoot }),
      tsStrictness: readTsStrictness(projectRoot),
      any: collectAnyMetrics(srcRoot),
      topRuntimeFiles: collectTopRuntimeFiles({ srcRoot, top }),
      boundaryViolationCount: boundaryAnalysis.violations.length,
      unexpectedContractFileCount: contractOwnershipMetrics.unexpectedContractFileCount,
      totalContractLikeFiles: contractOwnershipMetrics.totalContractLikeFiles,
      unexpectedContractFiles: contractOwnershipMetrics.unexpectedContractFiles,
      shaderDuplicateDivergenceCount: shaderDuplicateMetrics.divergentPairCount,
      shaderDuplicateFileCount: shaderDuplicateMetrics.duplicateFileCount,
      shaderDuplicateFiles: shaderDuplicateMetrics.duplicateFiles,
      shaderDuplicatePairs: shaderDuplicateMetrics.duplicatePairs,
      runtimeJsDtsTwinCount: runtimeTwinMetrics.pairCount,
      runtimeJsDtsTwinPairs: runtimeTwinMetrics.pairs,
      sharedBaseInterfaceJsOrDtsFileCount: sharedTypeScriptCutoverMetrics.fileCount,
      sharedBaseInterfaceJsOrDtsFiles: sharedTypeScriptCutoverMetrics.files,
      inlineCanonicalMockAssignmentCount: inlineMockMetrics.inlineCanonicalMockAssignmentCount,
      inlineCanonicalMockFiles: inlineMockMetrics.filesWithAssignments,
      aliasManifestDriftCount: aliasDriftMetrics.driftCount,
      aliasManifestDrift: {
        missing: aliasDriftMetrics.manifestMissing,
        extras: aliasDriftMetrics.manifestExtras
      },
      platformManifestDriftCount: platformDriftMetrics.driftCount,
      platformManifestDrift: {
        missing: platformDriftMetrics.manifestMissing,
        extras: platformDriftMetrics.matrixExtras
      }
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
