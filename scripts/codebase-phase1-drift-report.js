#!/usr/bin/env node
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { parseFlagArgs } from './lib/cli.js';
import { normalizePath, readJsonFile } from './lib/files.js';
import { generatedFileHeader, writeGeneratedArtifact } from './lib/generate-artifacts.js';
import { createReport, writeJsonReport } from './lib/json-report.js';
import { compareSortedValues, flattenStringLeaves } from './lib/manifest-drift.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const manifestPaths = {
  ipc: 'src/shared/ipc/ipc.manifest.json',
  events: 'src/shared/events/event.manifest.json',
  devices: 'src/shared/features/devices/device.manifest.json',
  settings: 'src/shared/features/settings/settings.definitions.json',
  renderPasses: 'packages/prismgb-gpu/src/domain/render-passes/render-passes.contract.json',
  architecture: 'scripts/manifests/architecture.manifest.json',
  platforms: 'scripts/manifests/platforms.manifest.json'
};

function resolveProjectPath(relativePath) {
  return path.resolve(projectRoot, relativePath);
}

function readProjectJson(relativePath) {
  return readJsonFile(resolveProjectPath(relativePath));
}

function readProjectText(relativePath) {
  return fs.readFileSync(resolveProjectPath(relativePath), 'utf8');
}

function collectIpcManifestChannels(ipcManifest) {
  return ipcManifest.namespaces.flatMap((namespace) => [
    ...(namespace.invoke || []).map((entry) => entry.channel),
    ...(namespace.subscriptions || []).map((entry) => entry.channel)
  ]);
}

function collectIpcManifestMethods(ipcManifest) {
  return Object.fromEntries(
    ipcManifest.namespaces.map((namespace) => [
      namespace.apiName,
      namespace.exposedMethods || []
    ])
  );
}

function collectEventManifestValues(eventManifest, scope) {
  return eventManifest.scopes
    .filter((entry) => entry.scope === scope)
    .flatMap((entry) => entry.events.map((event) => event.value));
}

function extractStringValuesFromSource(sourceText) {
  const matches = [...sourceText.matchAll(/['"]([a-z][a-z0-9-]*:[a-z][a-z0-9-]*)['"]/g)];
  return matches.map((match) => match[1]);
}

function extractPreloadExposures(sourceText) {
  const exposeRegex = /contextBridge\.exposeInMainWorld\('([^']+)',\s*\{([\s\S]*?)\}\);/g;
  const exposures = {};

  for (const match of sourceText.matchAll(exposeRegex)) {
    const [, apiName, body] = match;
    exposures[apiName] = [...body.matchAll(/^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:/gm)]
      .map((methodMatch) => methodMatch[1]);
  }

  return exposures;
}

function collectManifestDefaults(settingsManifest) {
  return Object.fromEntries(
    settingsManifest.definitions.map((definition) => [definition.name, definition.default])
  );
}

function collectManifestStorageKeys(settingsManifest) {
  return settingsManifest.definitions.map((definition) => definition.storageKey);
}

function extractStorageKeyValues(sourceText) {
  const block = sourceText.match(/export const SettingsStorageKeys = \{([\s\S]*?)\};/)?.[1] || '';
  return [...block.matchAll(/:\s*'([^']+)'/g)].map((match) => match[1]);
}

function collectRenderPassShaderFiles(renderPassManifest) {
  const webgpu = renderPassManifest.passes.map((pass) =>
    `packages/prismgb-gpu/src/infrastructure/webgpu/shaders/${pass.webgpuShader}`
  );
  const webgl2 = renderPassManifest.passes.map((pass) =>
    `packages/prismgb-gpu/src/infrastructure/webgl2/shaders/${pass.webgl2FragmentShader}`
  );
  const utilities = renderPassManifest.utilityShaders.map((shader) =>
    `packages/prismgb-gpu/src/infrastructure/webgl2/shaders/${shader.file}`
  );

  return [...webgpu, ...webgl2, ...utilities];
}

function collectTsconfigAliases(tsconfigPath) {
  const parsed = readProjectJson(tsconfigPath);
  return Object.keys(parsed.compilerOptions?.paths || {}).map((alias) => alias.replace(/\/\*$/, ''));
}

function extractViteAliasKeys() {
  const sourceText = readProjectText('vite.config.js');
  const quotedAliases = [...sourceText.matchAll(/['"](@(?:\/|main|renderer|preload|shared|prismgb\/gpu)?|url)['"]\s*:/g)]
    .map((match) => match[1]);
  const unquotedAliases = [...sourceText.matchAll(/^\s*(url)\s*:/gm)].map((match) => match[1]);

  return [...quotedAliases, ...unquotedAliases];
}

function extractVitestAliasKeys() {
  const sourceText = readProjectText('vitest.config.js');
  return [...sourceText.matchAll(/['"](@(?:\/|main|renderer|preload|shared|prismgb\/gpu)?|url)['"]\s*:/g)]
    .map((match) => match[1]);
}

function runBuildMatrix(args) {
  const output = execFileSync(process.execPath, ['scripts/ci/build-matrix.mjs', ...args], {
    cwd: projectRoot,
    encoding: 'utf8'
  });
  return JSON.parse(output);
}

function createPreloadDeclarationPreview(ipcManifest) {
  const lines = [
    generatedFileHeader({ source: manifestPaths.ipc }).trimEnd(),
    'export {};',
    '',
    'declare global {',
    '  interface Window {'
  ];

  for (const namespace of ipcManifest.namespaces) {
    lines.push(`    ${namespace.apiName}?: {`);
    for (const method of namespace.exposedMethods) {
      lines.push(`      ${method}: (...args: unknown[]) => unknown;`);
    }
    lines.push('    };');
  }

  lines.push('  }', '}', '');
  return `${lines.join('\n')}`;
}

function createDocsFragment(manifests) {
  const rows = [
    ['IPC namespaces', manifests.ipc.namespaces.length],
    ['IPC channels', collectIpcManifestChannels(manifests.ipc).length],
    ['Renderer events', collectEventManifestValues(manifests.events, 'renderer').length],
    ['Main events', collectEventManifestValues(manifests.events, 'main').length],
    ['Device profiles', manifests.devices.devices.length],
    ['Settings definitions', manifests.settings.definitions.length],
    ['Render passes', manifests.renderPasses.passes.length],
    ['Architecture aliases', manifests.architecture.aliases.length],
    ['Platform targets', manifests.platforms.platforms.length]
  ];

  return [
    '<!-- CODEBASE_PHASE1_REPORT_ONLY_MANIFESTS:START -->',
    '| Surface | Count |',
    '| --- | ---: |',
    ...rows.map(([label, count]) => `| ${label} | ${count} |`),
    '<!-- CODEBASE_PHASE1_REPORT_ONLY_MANIFESTS:END -->',
    ''
  ].join('\n');
}

function loadManifests() {
  return Object.fromEntries(
    Object.entries(manifestPaths).map(([key, manifestPath]) => [key, readProjectJson(manifestPath)])
  );
}

function buildPhase1DriftReport() {
  const manifests = loadManifests();
  const checks = [];

  const currentChannels = flattenStringLeaves(readProjectJson('src/shared/ipc/channels.json'));
  checks.push(compareSortedValues({
    name: 'ipc channels manifest matches channels.json',
    expected: currentChannels,
    actual: collectIpcManifestChannels(manifests.ipc)
  }));

  const currentPreloadExposures = extractPreloadExposures(readProjectText('src/preload/index.js'));
  const manifestPreloadExposures = collectIpcManifestMethods(manifests.ipc);
  checks.push(compareSortedValues({
    name: 'ipc manifest exposed API names match preload index',
    expected: Object.keys(currentPreloadExposures),
    actual: Object.keys(manifestPreloadExposures)
  }));
  for (const [apiName, methods] of Object.entries(currentPreloadExposures)) {
    checks.push(compareSortedValues({
      name: `ipc manifest methods match ${apiName}`,
      expected: methods,
      actual: manifestPreloadExposures[apiName] || []
    }));
  }

  checks.push(compareSortedValues({
    name: 'renderer event manifest matches EventChannels values',
    expected: extractStringValuesFromSource(readProjectText('src/shared/events/event-channels.ts')),
    actual: collectEventManifestValues(manifests.events, 'renderer')
  }));

  checks.push(compareSortedValues({
    name: 'main event manifest matches MainEventChannels values',
    expected: extractStringValuesFromSource(readProjectText('src/main/infrastructure/events/event-channels.config.ts')),
    actual: collectEventManifestValues(manifests.events, 'main')
  }));

  const chromatic = manifests.devices.devices.find((device) => device.id === 'chromatic-mod-retro');
  checks.push({
    name: 'device manifest contains Chromatic profile',
    status: chromatic ? 'pass' : 'fail',
    expectedCount: 1,
    actualCount: chromatic ? 1 : 0,
    missing: chromatic ? [] : ['chromatic-mod-retro'],
    extra: []
  });

  checks.push(compareSortedValues({
    name: 'settings manifest keys match SettingsStorageKeys',
    expected: extractStorageKeyValues(readProjectText('src/shared/config/storage-keys.config.ts')),
    actual: collectManifestStorageKeys(manifests.settings)
  }));

  const defaults = collectManifestDefaults(manifests.settings);
  checks.push({
    name: 'settings manifest records current recording format compatibility default',
    status: defaults.recordingFormat === 'webm' ? 'pass' : 'fail',
    expected: 'webm',
    actual: defaults.recordingFormat,
    missing: defaults.recordingFormat === 'webm' ? [] : ['recordingFormat=webm'],
    extra: []
  });

  const missingShaderFiles = collectRenderPassShaderFiles(manifests.renderPasses)
    .filter((relativePath) => !fs.existsSync(resolveProjectPath(relativePath)));
  checks.push({
    name: 'render pass manifest shader files exist',
    status: missingShaderFiles.length === 0 ? 'pass' : 'fail',
    expectedCount: collectRenderPassShaderFiles(manifests.renderPasses).length,
    actualCount: collectRenderPassShaderFiles(manifests.renderPasses).length - missingShaderFiles.length,
    missing: missingShaderFiles,
    extra: []
  });

  const manifestAliases = manifests.architecture.aliases.map((alias) => alias.id);
  const nonRuntimeManifestAliases = manifestAliases.filter((alias) => alias !== 'url');
  checks.push(compareSortedValues({
    name: 'architecture aliases cover tsconfig.base aliases',
    expected: collectTsconfigAliases('tsconfig.base.json'),
    actual: nonRuntimeManifestAliases
  }));
  checks.push(compareSortedValues({
    name: 'architecture aliases cover tsconfig.app aliases',
    expected: collectTsconfigAliases('tsconfig.app.json'),
    actual: nonRuntimeManifestAliases
  }));
  checks.push(compareSortedValues({
    name: 'architecture aliases cover Vite aliases',
    expected: [...new Set(extractViteAliasKeys())],
    actual: manifestAliases
  }));
  checks.push(compareSortedValues({
    name: 'architecture aliases cover Vitest aliases',
    expected: [...new Set(extractVitestAliasKeys())],
    actual: manifestAliases.filter((alias) => alias !== 'url')
  }));

  const releaseLabels = runBuildMatrix(['--mode', 'release', '--platforms', 'all']).map((entry) => entry.label);
  checks.push(compareSortedValues({
    name: 'platform manifest labels match release build matrix',
    expected: releaseLabels,
    actual: manifests.platforms.platforms.map((platform) => platform.label)
  }));

  const smokeLabels = runBuildMatrix(['--mode', 'smoke', '--platform', 'all']).map((entry) => entry.label);
  checks.push(compareSortedValues({
    name: 'platform manifest labels match smoke build matrix',
    expected: smokeLabels,
    actual: manifests.platforms.platforms.map((platform) => platform.label)
  }));

  return {
    report: createReport({
      name: 'codebase-size-reduction-phase1-drift',
      checks
    }),
    generated: {
      preloadDeclaration: createPreloadDeclarationPreview(manifests.ipc),
      docsFragment: createDocsFragment(manifests)
    }
  };
}

function printSummary(report) {
  console.log('Codebase Size Reduction Phase 1 Drift Report');
  console.log(`- status: ${report.status}`);
  for (const check of report.checks) {
    console.log(`- ${check.status}: ${check.name}`);
  }
}

function writeGeneratedOutputs(generated) {
  const outputRoot = resolveProjectPath('artifacts/codebase-reduction/phase1');
  const declarationPath = writeGeneratedArtifact({
    outputRoot,
    relativePath: 'preload-api.generated-preview.d.ts',
    contents: generated.preloadDeclaration
  });
  const docsPath = writeGeneratedArtifact({
    outputRoot,
    relativePath: 'manifest-docs.fragment.md',
    contents: generated.docsFragment
  });

  return { declarationPath, docsPath };
}

function main(argv = process.argv.slice(2)) {
  const options = parseFlagArgs(argv, {
    json: { boolean: true },
    'write-generated': { boolean: true }
  });
  const { report, generated } = buildPhase1DriftReport();

  if (options.output) {
    const outputPath = writeJsonReport(options.output, report, projectRoot);
    console.log(`Wrote report: ${outputPath}`);
  }

  if (options['write-generated']) {
    const outputs = writeGeneratedOutputs(generated);
    console.log(`Wrote generated declaration preview: ${outputs.declarationPath}`);
    console.log(`Wrote generated docs fragment: ${outputs.docsPath}`);
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printSummary(report);
  }

  process.exit(report.status === 'pass' ? 0 : 1);
}

const invokedScript = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedScript) {
  main();
}

export {
  buildPhase1DriftReport,
  collectIpcManifestChannels,
  collectIpcManifestMethods,
  collectEventManifestValues,
  createDocsFragment,
  createPreloadDeclarationPreview,
  extractPreloadExposures,
  loadManifests,
  writeGeneratedOutputs
};
