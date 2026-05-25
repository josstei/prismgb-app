#!/usr/bin/env node
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { fileURLToPath, pathToFileURL } from 'url';
import { parseFlagArgs } from './lib/cli.js';
import { listFiles, readJsonFile } from './lib/files.js';
import { writeGeneratedArtifact } from './lib/generate-artifacts.js';
import { createReport, writeJsonReport } from './lib/json-report.js';
import { compareSortedValues, flattenStringLeaves } from './lib/manifest-drift.js';
import { extractAliasKeysFromConfigSource } from './lib/alias-config.js';

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

function resolveProjectPath(relativePath) { return path.resolve(projectRoot, relativePath); }

function readProjectJson(relativePath) { return readJsonFile(resolveProjectPath(relativePath)); }
function readProjectText(relativePath) { return fs.readFileSync(resolveProjectPath(relativePath), 'utf8'); }

function resolvePreloadDeclarationSources(options = {}) {
  if (Array.isArray(options.preloadTypeSources) && options.preloadTypeSources.length > 0) return options.preloadTypeSources;
  if (typeof options.preloadTypeSource === 'string') return [{ filePath: 'src/types/preload-api.d.ts', sourceText: options.preloadTypeSource }];
  return listFiles(resolveProjectPath('src/types'), (filePath) => filePath.endsWith('.d.ts'))
    .sort()
    .map((filePath) => ({ filePath: path.relative(projectRoot, filePath).split(path.sep).join('/'), sourceText: fs.readFileSync(filePath, 'utf8') }));
}

function collectIpcManifestChannels(ipcManifest) {
  return ipcManifest.namespaces.flatMap((namespace) => [...(namespace.invoke || []), ...(namespace.subscriptions || [])].map((entry) => entry.channel));
}
function collectIpcManifestMethods(ipcManifest) {
  return Object.fromEntries(ipcManifest.namespaces.map((namespace) => [namespace.apiName, namespace.exposedMethods || []]));
}
function collectIpcManifestRequestEntries(ipcManifest) {
  return ipcManifest.namespaces.flatMap((namespace) => (namespace.invoke || []).map((entry) => `${entry.channel} ${JSON.stringify(entry.request || [])}`));
}
function collectIpcManifestSignatureEntries(ipcManifest, section, createManifestSignature) {
  return ipcManifest.namespaces.flatMap((namespace) => (namespace[section] || []).map((entry) => `${entry.channel} ${createManifestSignature(entry)}`));
}
function collectIpcManifestOwnedMethodIdentities(ipcManifest) {
  return ipcManifest.namespaces.flatMap((namespace) =>
    [...(namespace.invoke || []), ...(namespace.subscriptions || [])].map((entry) => `${namespace.apiName}.${entry.method}`));
}
function collectPreloadDeclarationMethodIdentities({ interfaces, windowApis }) {
  return [...windowApis.entries()].flatMap(([apiName, interfaceName]) => [...(interfaces.get(interfaceName) || new Map()).entries()]
    .flatMap(([method, signatures]) => signatures.map(() => `${apiName}.${method}`)));
}
function collectPreloadDeclarationGlobalApiTypeEntries({ globalApis }) {
  return globalApis.filter(({ apiName }) => apiName.endsWith('API')).map(({ apiName, type }) => `${apiName} ${type}`);
}
function collectPreloadDeclarationWindowApiEntries({ windowApiEntries }) {
  return windowApiEntries.filter(({ apiName }) => apiName.endsWith('API')).map(({ apiName, optional, type }) => `${apiName}${optional ? '?' : ''}: ${type}`);
}
function collectManifestGlobalApiTypeEntries(ipcManifest, { windowApis }) {
  return ipcManifest.namespaces.map((namespace) => `${namespace.apiName} ${windowApis.get(namespace.apiName) || 'missing-window-api'} | undefined`);
}
function collectManifestWindowApiEntries(ipcManifest) {
  return ipcManifest.namespaces.map((namespace) => `${namespace.apiName}?: ${apiInterfaceName(namespace.apiName)}`);
}

function propertyName(node, sourceFile) { return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : node?.getText(sourceFile) || null; }
function unwrappedType(node) { while (node && ts.isParenthesizedTypeNode(node)) node = node.type; return node; }
function typeText(node, sourceFile) { return normalizePayloadType(node?.getText(sourceFile) || 'unknown'); }
function callableType(node) { return ts.isPropertySignature(node) ? unwrappedType(node.type) : null; }
function callableParameters(node) { const typeNode = callableType(node); return typeNode && ts.isFunctionTypeNode(typeNode) ? typeNode.parameters : node?.parameters || []; }
function callableReturnType(node) { const typeNode = callableType(node); return typeNode && ts.isFunctionTypeNode(typeNode) ? typeNode.type : node?.type; }
function typeReferenceName(node, sourceFile) { const typeNode = unwrappedType(node); return ts.isTypeReferenceNode(typeNode) ? typeNode.typeName.getText(sourceFile) : typeText(typeNode, sourceFile); }
function parseManifestParameterDescriptor(parameterDescriptor) {
  const descriptor = String(parameterDescriptor || '').trim();
  const match = descriptor.match(/^(\.\.\.)?([A-Za-z_$][A-Za-z0-9_$]*)(\?)?\s*:\s*(.+)$/);
  if (!match) return { signature: normalizePayloadType(descriptor || 'unknown'), type: 'unknown' };
  const [, rest = '', name, optional = '', parameterType] = match;
  const normalizedType = normalizePayloadType(parameterType);
  return { signature: `${rest}${name}${optional}: ${normalizedType}`, type: normalizedType };
}
function manifestParameterSignatures(entry) { return (entry.parameters || entry.request || []).map((descriptor) => parseManifestParameterDescriptor(descriptor).signature); }
function createInvokeManifestSignature(entry) { return `(${manifestParameterSignatures(entry).join(', ')}): Promise<${normalizePayloadType(entry.response || 'unknown')}>`; }
function createSubscriptionManifestSignature(entry) {
  const payloadType = normalizePayloadType(entry.payload || 'unknown'), callbackSignature = payloadType === 'void' ? 'callback: () => void' : `callback: (payload: ${payloadType}) => void`;
  return `(${callbackSignature}): ${normalizePayloadType(entry.return || 'Unsubscribe')}`;
}

function collectPreloadDeclarationSurface(preloadDeclarationSources) {
  const interfaces = new Map(), windowApis = new Map(), windowApiEntries = [], globalApis = [];
  for (const { filePath = 'src/types/preload-api.d.ts', sourceText = '' } of preloadDeclarationSources) {
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
    const visit = (node, inGlobal = false) => {
      const nextInGlobal = inGlobal || (ts.isModuleDeclaration(node) && (node.name.kind === ts.SyntaxKind.GlobalKeyword || node.name.getText(sourceFile) === 'global'));
      if (nextInGlobal && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.type) globalApis.push({ apiName: node.name.text, type: typeText(node.type, sourceFile) });
      if (!ts.isInterfaceDeclaration(node)) {
        ts.forEachChild(node, (child) => visit(child, nextInGlobal));
        return;
      }
      const methodSignatures = new Map();
      for (const member of node.members) {
        const memberName = member.name ? propertyName(member.name, sourceFile) : null;
        if (memberName && (ts.isMethodSignature(member) || ts.isPropertySignature(member))) methodSignatures.set(memberName, [...(methodSignatures.get(memberName) || []), { methodSignature: member, sourceFile }]);
        if (node.name.text === 'Window' && ts.isPropertySignature(member) && member.name) {
          const apiName = memberName, interfaceName = typeReferenceName(member.type, sourceFile);
          if (apiName && interfaceName) {
            windowApis.set(apiName, interfaceName);
            windowApiEntries.push({ apiName, optional: Boolean(member.questionToken), type: interfaceName });
          }
        }
      }
      const interfaceSignatures = interfaces.get(node.name.text) || new Map();
      for (const [methodName, signatures] of methodSignatures.entries()) interfaceSignatures.set(methodName, [...(interfaceSignatures.get(methodName) || []), ...signatures]);
      interfaces.set(node.name.text, interfaceSignatures);
      ts.forEachChild(node, (child) => visit(child, nextInGlobal));
    }; visit(sourceFile);
  }
  return { interfaces, windowApis, windowApiEntries, globalApis };
}
function declarationParameterSignature(parameter, sourceFile) {
  const name = parameter.name?.getText(sourceFile) || 'arg';
  return `${parameter.dotDotDotToken ? '...' : ''}${name}${parameter.questionToken ? '?' : ''}: ${typeText(parameter.type, sourceFile)}`;
}
function extractInvokeDeclarationSignature(methodSignature, sourceFile) {
  const parameterList = callableParameters(methodSignature).map((parameter) => declarationParameterSignature(parameter, sourceFile)).join(', ');
  return `${methodSignature?.questionToken ? '?' : ''}(${parameterList}): ${typeText(callableReturnType(methodSignature), sourceFile)}`;
}
function extractSubscriptionCallbackSignature(methodSignature, sourceFile) {
  const parameters = callableParameters(methodSignature);
  if (!methodSignature || parameters.length !== 1) return 'unknown';
  const callbackType = unwrappedType(parameters[0]?.type);
  if (!callbackType || !ts.isFunctionTypeNode(callbackType)) return 'unknown';
  const returnType = typeText(callbackType.type, sourceFile);
  if (callbackType.parameters.length === 0) return `callback: () => ${returnType}`;
  if (callbackType.parameters.length !== 1) return 'unknown';
  const payloadType = typeText(callbackType.parameters[0]?.type, sourceFile);
  return payloadType === 'void' ? 'unknown' : `callback: (payload: ${payloadType}) => ${returnType}`;
}
function extractSubscriptionDeclarationSignature(methodSignature, sourceFile) {
  const callbackSignature = extractSubscriptionCallbackSignature(methodSignature, sourceFile);
  return callbackSignature === 'unknown' ? 'unknown' : `${methodSignature?.questionToken ? '?' : ''}(${callbackSignature}): ${typeText(callableReturnType(methodSignature), sourceFile)}`;
}
function resolveManifestOwnedDeclarationSignature(methodSignatures, manifestSignature, extractSignature) {
  const declarationSignatures = methodSignatures.map(({ methodSignature, sourceFile }) => extractSignature(methodSignature, sourceFile));
  const compatibleDeclarationCount = declarationSignatures.filter((signature) => signature === manifestSignature).length;
  return declarationSignatures.length === 1
    ? compatibleDeclarationCount === 1 ? manifestSignature : declarationSignatures[0]
    : `declaration-count:${declarationSignatures.length} compatible-count:${compatibleDeclarationCount}`;
}
function collectPreloadDeclarationSignatureEntries(ipcManifest, preloadDeclarationSurface, section, createManifestSignature, extractDeclarationSignature) {
  const { interfaces, windowApis } = preloadDeclarationSurface;
  return ipcManifest.namespaces.flatMap((namespace) => {
    const methods = interfaces.get(windowApis.get(namespace.apiName)) || new Map();
    return (namespace[section] || []).map((entry) => {
      const manifestSignature = createManifestSignature(entry);
      const methodSignatures = methods.get(entry.method) || [];
      return `${entry.channel} ${resolveManifestOwnedDeclarationSignature(methodSignatures, manifestSignature, extractDeclarationSignature)}`;
    });
  });
}
const typeReferenceIgnoreList = new Set('Array ArrayBuffer Promise Record Readonly ReadonlyArray Unsubscribe boolean false never null number object string true undefined unknown void'.split(' '));
function collectTypeReferencesFromTypeText(typeText) {
  return [...normalizePayloadType(typeText).matchAll(/\b[A-Za-z_$][A-Za-z0-9_$]*\b/g)]
    .map((match) => match[0])
    .filter((typeName) => !typeReferenceIgnoreList.has(typeName));
}
function collectTypeReferencesFromManifestParameters(entry) {
  return (entry.parameters || entry.request || []).flatMap((descriptor) => collectTypeReferencesFromTypeText(parseManifestParameterDescriptor(descriptor).type));
}

function collectIpcManifestPreloadTypeReferences(ipcManifest) {
  return [...new Set(ipcManifest.namespaces.flatMap((namespace) => [
    ...(namespace.invoke || []).flatMap((entry) => collectTypeReferencesFromManifestParameters(entry)),
    ...(namespace.invoke || []).flatMap((entry) => collectTypeReferencesFromTypeText(entry.response || 'unknown')),
    ...(namespace.subscriptions || []).flatMap((entry) => collectTypeReferencesFromTypeText(entry.payload || 'unknown')),
    ...(namespace.subscriptions || []).flatMap((entry) => collectTypeReferencesFromTypeText(entry.return || 'Unsubscribe'))
  ]))].sort();
}

function createTypeImportLines(ipcManifest) {
  const typeReferences = collectIpcManifestPreloadTypeReferences(ipcManifest);
  return typeReferences.length === 0 ? [] : ['import type {', ...typeReferences.map((typeName, index) => `  ${typeName}${index === typeReferences.length - 1 ? '' : ','}`), "} from '@shared/ipc/preload-api.contract.js';", ''];
}

function parseArgumentSchema(schemaSource) {
  return [...schemaSource.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

function collectIpcHandlerRequestEntries(ipcChannels) {
  const handlersRoot = resolveProjectPath('src/main/ipc/handlers');
  return fs.readdirSync(handlersRoot)
    .filter((fileName) => fileName.endsWith('.handler.ts'))
    .flatMap((fileName) => {
      const sourceText = fs.readFileSync(path.join(handlersRoot, fileName), 'utf8');
      return [...sourceText.matchAll(
        /channel:\s*IPC_CHANNELS\.([A-Z0-9_]+)\.([A-Z0-9_]+)[\s\S]*?argumentSchema:\s*\[([\s\S]*?)\]/g
      )].map((match) => {
        const [, namespace, channelKey, schemaSource] = match;
        const channel = ipcChannels[namespace]?.[channelKey] || `IPC_CHANNELS.${namespace}.${channelKey}`;
        return `${channel} ${JSON.stringify(parseArgumentSchema(schemaSource))}`;
      });
    });
}

function collectEventManifestValues(eventManifest, scope) {
  return eventManifest.scopes
    .filter((entry) => entry.scope === scope)
    .flatMap((entry) => entry.events.map((event) => event.value));
}

function normalizePayloadType(payloadType) {
  return String(payloadType).replace(/\s+/g, ' ').trim();
}

function collectEventManifestPayloadEntries(eventManifest) {
  return eventManifest.scopes
    .filter((entry) => entry.scope === 'renderer')
    .flatMap((entry) => entry.events.map((event) =>
      `${event.value} ${normalizePayloadType(event.payload)}`
    ));
}

function collectEventChannelReferenceValues(sourceText) {
  const channelValues = new Map();
  const domainBlocks = sourceText.matchAll(/([A-Z0-9_]+):\s*\{([\s\S]*?)\n\s*\}/g);

  for (const [, domain, body] of domainBlocks) {
    for (const [, channelKey, value] of body.matchAll(/([A-Z0-9_]+):\s*['"]([^'"]+)['"]/g)) {
      channelValues.set(`EventChannels.${domain}.${channelKey}`, value);
    }
  }

  return channelValues;
}

function collectEventPayloadMapEntries(payloadSourceText, channelSourceText) {
  const channelValues = collectEventChannelReferenceValues(channelSourceText);
  const payloadMapBody = payloadSourceText.match(/export type EventPayloadMap = \{([\s\S]*?)\n\};/);
  if (!payloadMapBody) return [];

  return [...payloadMapBody[1].matchAll(/\[EventChannels\.([A-Z0-9_]+)\.([A-Z0-9_]+)\]:\s*([^;]+);/g)]
    .map(([, domain, channelKey, payloadType]) => {
      const channelReference = `EventChannels.${domain}.${channelKey}`;
      const channelValue = channelValues.get(channelReference) || channelReference;
      return `${channelValue} ${normalizePayloadType(payloadType)}`;
    });
}

function extractStringValuesFromSource(sourceText) {
  const matches = [...sourceText.matchAll(/['"]([a-z][a-z0-9-]*:[a-z][a-z0-9-]*)['"]/g)];
  return matches.map((match) => match[1]);
}

function collectMainEventChannelValues(sourceText, eventManifest) {
  const literalValues = extractStringValuesFromSource(sourceText);
  if (literalValues.length > 0) return literalValues;

  const derivesFromManifest = sourceText.includes('event.manifest.json');
  const selectsMainScope = /scope\s*===\s*['"]main['"]/.test(sourceText);
  const buildsChannelsFromMainScope = /MainEventChannels/.test(sourceText) && /mainScope\.events/.test(sourceText);
  return derivesFromManifest && selectsMainScope && buildsChannelsFromMainScope ? collectEventManifestValues(eventManifest, 'main') : [];
}

function extractPreloadExposures(sourceText, ipcManifest = null) {
  const usesManifestExposureFactory = sourceText.includes('@preload/exposure.factory.js')
    && sourceText.includes('exposePreloadApis(contextBridge');

  if (usesManifestExposureFactory) return ipcManifest ? collectIpcManifestMethods(ipcManifest) : {};

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

function storageConfigDerivesSettingsKeys(sourceText) {
  return sourceText.includes('SettingsDefinitions.definitions.map')
    && sourceText.includes('definition.storageKey')
    && sourceText.includes('...SETTINGS_STORAGE_KEYS');
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

function renderPassOwnsUniformMetadata(pass) {
  return Boolean(
    pass.webgpuUniformLayout &&
    typeof pass.webgpuUniformLayout.byteLength === 'number' &&
    Array.isArray(pass.webgpuUniformLayout.members) &&
    pass.webgpuUniformLayout.members.length > 0 &&
    pass.webgpuUniformLayout.members.every((member) => member.source) &&
    pass.webgl2Uniforms &&
    pass.webgl2Uniforms.texture &&
    Array.isArray(pass.webgl2Uniforms.additional)
  );
}

function collectTsconfigAliases(tsconfigPath) {
  const parsed = readProjectJson(tsconfigPath);
  return [...new Set(
    Object.keys(parsed.compilerOptions?.paths || {}).map((alias) => alias.replace(/\/\*$/, ''))
  )];
}

function extractViteAliasKeys() {
  const sourceText = readProjectText('vite.config.js');
  return extractAliasKeysFromConfigSource(sourceText, 'vite.config.js');
}

function extractVitestAliasKeys() {
  const sourceText = readProjectText('vitest.config.js');
  return extractAliasKeysFromConfigSource(sourceText, 'vitest.config.js');
}

function runBuildMatrix(args) {
  const output = execFileSync(process.execPath, ['scripts/ci/build-matrix.mjs', ...args], {
    cwd: projectRoot,
    encoding: 'utf8'
  });
  return JSON.parse(output);
}

function apiInterfaceName(apiName) { return `${apiName[0].toUpperCase()}${apiName.slice(1)}`; }

function createPreloadDeclarationPreview(ipcManifest) {
  const lines = [
    '// Generated by PrismGB tooling.',
    `// Source: ${manifestPaths.ipc}`,
    '',
    ...createTypeImportLines(ipcManifest),
    'export {};',
    '',
    'type Unsubscribe = () => void;',
    ''
  ];

  for (const namespace of ipcManifest.namespaces) {
    lines.push(`interface ${apiInterfaceName(namespace.apiName)} {`);
    for (const method of namespace.exposedMethods) {
      const invokeEntries = (namespace.invoke || []).filter((entry) => entry.method === method);
      const subscriptionEntries = (namespace.subscriptions || []).filter((entry) => entry.method === method);
      if (invokeEntries.length === 1 && subscriptionEntries.length === 0) { lines.push(`  ${method}${createInvokeManifestSignature(invokeEntries[0])};`); continue; }
      if (subscriptionEntries.length === 1 && invokeEntries.length === 0) { lines.push(`  ${method}${createSubscriptionManifestSignature(subscriptionEntries[0])};`); continue; }
      lines.push(`  ${method}(...args: unknown[]): unknown;`);
    }
    lines.push('}', '');
  }

  lines.push('declare global {', '  interface Window {');
  for (const namespace of ipcManifest.namespaces) lines.push(`    ${namespace.apiName}?: ${apiInterfaceName(namespace.apiName)};`);
  lines.push('  }', '');
  for (const namespace of ipcManifest.namespaces) lines.push(`  var ${namespace.apiName}: ${apiInterfaceName(namespace.apiName)} | undefined;`);
  lines.push('}', '');
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
    '<!-- CODEBASE_PHASE1_MANIFESTS:START -->',
    '| Surface | Count |',
    '| --- | ---: |',
    ...rows.map(([label, count]) => `| ${label} | ${count} |`),
    '<!-- CODEBASE_PHASE1_MANIFESTS:END -->',
    ''
  ].join('\n');
}

function formatInlineCodeList(values) { return values.length === 0 ? 'None' : values.map((value) => `\`${value}\``).join(', '); }

function createFeatureMapGeneratedBlock(manifests) {
  const architectureAliases = manifests.architecture.aliases.map((alias) => alias.id);
  const architectureLayers = manifests.architecture.layers.map((layer) => layer.id);
  const retiredAliases = manifests.architecture.retiredAliases.map((alias) => alias.id);
  const devices = manifests.devices.devices.map((device) =>
    `${device.name} (\`${device.usb.hexVendorId}:${device.usb.hexProductId}\`, ` +
    `${device.display.nativeWidth}x${device.display.nativeHeight}, fixture \`${device.fixture.label}\`)`
  );
  const settingsUiControls = manifests.settings.definitions
    .filter((definition) => definition.ui?.controlId)
    .sort((left, right) => (left.ui.order ?? 0) - (right.ui.order ?? 0))
    .map((definition) => `\`${definition.name}\` -> \`${definition.ui.controlId}\``);

  return [
    '<!-- CODEBASE_FEATURE_MAP:START -->',
    '| Manifest surface | Generated facts |',
    '| --- | --- |',
    `| Architecture paths | aliases: ${formatInlineCodeList(architectureAliases)}; layers: ${formatInlineCodeList(architectureLayers)}; retired: ${formatInlineCodeList(retiredAliases)} |`,
    `| Devices | ${devices.join('<br>')} |`,
    `| Settings UI | ${settingsUiControls.join(', ')} |`,
    `| Startup preferences | ${formatInlineCodeList(manifests.settings.loadAllPreferencesShape)} |`,
    '<!-- CODEBASE_FEATURE_MAP:END -->',
    ''
  ].join('\n');
}

function extractMarkedBlock(sourceText, markerName) {
  const start = `<!-- ${markerName}:START -->`;
  const end = `<!-- ${markerName}:END -->`;
  const startIndex = sourceText.indexOf(start);
  const endIndex = sourceText.indexOf(end);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return null;
  }

  return sourceText.slice(startIndex, endIndex + end.length).trimEnd();
}

function loadManifests() {
  return Object.fromEntries(Object.entries(manifestPaths).map(([key, manifestPath]) => [key, readProjectJson(manifestPath)]));
}

function createDerivedSourceCheck({ name, sourceText, requiredFragments }) {
  const missingFragments = requiredFragments.filter((fragment) => !sourceText.includes(fragment));
  return { name, status: missingFragments.length === 0 ? 'pass' : 'fail', expectedCount: requiredFragments.length, actualCount: requiredFragments.length - missingFragments.length, missing: missingFragments, extra: [] };
}

function createGeneratedBlockCheck({ name, sourceText, markerName, expectedBlock }) {
  const actualBlock = extractMarkedBlock(sourceText, markerName);
  const expected = expectedBlock.trimEnd(), pass = actualBlock === expected;
  return {
    name,
    status: pass ? 'pass' : 'fail',
    expected,
    actual: actualBlock ?? 'missing',
    missing: actualBlock ? [] : [`${markerName}:START`],
    extra: actualBlock && !pass ? ['generated block drift'] : []
  };
}
function createExactSourceCheck({ name, sourceText, expectedText }) {
  const expected = expectedText.trimEnd(), actual = sourceText.trimEnd(), pass = actual === expected;
  return { name, status: pass ? 'pass' : 'fail', expected, actual, missing: pass ? [] : ['generated source parity'], extra: pass ? [] : ['checked-in source drift'] };
}
function createModeCheck(name, mode) {
  const pass = mode === 'enforced';
  return { name, status: pass ? 'pass' : 'fail', expected: 'enforced', actual: mode, missing: pass ? [] : ['mode=enforced'], extra: [] };
}
function createTypecheckSourceCheck({ name, filePath, sourceText }) {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const importedContractTypes = sourceFile.statements.flatMap((statement) => ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === '@shared/ipc/preload-api.contract.js' && ts.isNamedImports(statement.importClause?.namedBindings) ? statement.importClause.namedBindings.elements.map((element) => (element.propertyName || element.name).text) : []);
  const contractSource = ts.createSourceFile('preload-api.contract.ts', readProjectText('src/shared/ipc/preload-api.contract.ts'), ts.ScriptTarget.Latest, true);
  const contractExports = new Set(contractSource.statements.filter((statement) => statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) && statement.name).map((statement) => statement.name.text));
  const missingExports = importedContractTypes.filter((typeName) => !contractExports.has(typeName)).map((typeName) => `@shared/ipc/preload-api.contract.js does not export ${typeName}`);
  const parsed = ts.parseJsonConfigFileContent(readProjectJson('tsconfig.app.json'), ts.sys, projectRoot);
  const absolutePath = resolveProjectPath(filePath), host = ts.createCompilerHost({ ...parsed.options, noEmit: true });
  const readFile = host.readFile.bind(host), fileExists = host.fileExists.bind(host), getSourceFile = host.getSourceFile.bind(host);
  host.readFile = (candidate) => path.resolve(candidate) === absolutePath ? sourceText : readFile(candidate);
  host.fileExists = (candidate) => path.resolve(candidate) === absolutePath || fileExists(candidate);
  host.getSourceFile = (candidate, languageVersion, onError) => path.resolve(candidate) === absolutePath
    ? sourceFile
    : getSourceFile(candidate, languageVersion, onError);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([absolutePath], { ...parsed.options, noEmit: true }, host));
  const failures = [...missingExports, ...diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '))];
  return { name, status: failures.length === 0 ? 'pass' : 'fail', expected: 'valid TypeScript declaration', actual: failures.join('\n') || 'valid', missing: failures, extra: [] };
}

function buildPhase1DriftReport(manifests = loadManifests(), options = {}) {
  const checks = [];

  const ipcChannels = readProjectJson('src/shared/ipc/channels.json');
  const currentChannels = flattenStringLeaves(ipcChannels);
  const ipcExposureIdentities = manifests.ipc.namespaces.flatMap((namespace) => [
    namespace.apiName,
    ...(namespace.exposedMethods || []).map((method) => `${namespace.apiName}.${method}`)
  ]);
  const ipcExposedMethodIdentities = manifests.ipc.namespaces.flatMap((namespace) =>
    (namespace.exposedMethods || []).map((method) => `${namespace.apiName}.${method}`));
  checks.push(compareSortedValues({
    name: 'ipc manifest preload exposure entries are unique',
    expected: [...new Set(ipcExposureIdentities)],
    actual: ipcExposureIdentities
  }));
  checks.push(compareSortedValues({
    name: 'ipc manifest exposed methods are owned by exactly one invoke or subscription entry',
    expected: ipcExposedMethodIdentities,
    actual: collectIpcManifestOwnedMethodIdentities(manifests.ipc)
  }));
  checks.push(compareSortedValues({
    name: 'ipc channels manifest matches channels.json',
    expected: currentChannels,
    actual: collectIpcManifestChannels(manifests.ipc)
  }));
  checks.push(compareSortedValues({
    name: 'ipc manifest request schemas match main handler descriptors',
    expected: collectIpcHandlerRequestEntries(ipcChannels),
    actual: collectIpcManifestRequestEntries(manifests.ipc)
  }));
  checks.push(createModeCheck('ipc manifest is enforced', manifests.ipc.mode));
  const preloadDeclarationSurface = collectPreloadDeclarationSurface(resolvePreloadDeclarationSources(options));
  const generatedPreloadDeclaration = createPreloadDeclarationPreview(manifests.ipc);
  checks.push(createExactSourceCheck({
    name: 'preload declaration generated preview matches checked-in declaration',
    sourceText: readProjectText('src/types/preload-api.d.ts'),
    expectedText: generatedPreloadDeclaration
  }));
  checks.push(createTypecheckSourceCheck({
    name: 'preload declaration generated preview typechecks',
    filePath: 'src/types/preload-api.d.ts',
    sourceText: generatedPreloadDeclaration
  }));
  checks.push(compareSortedValues({
    name: 'preload window API declarations match manifest globals',
    expected: collectManifestWindowApiEntries(manifests.ipc),
    actual: collectPreloadDeclarationWindowApiEntries(preloadDeclarationSurface)
  }));
  checks.push(compareSortedValues({
    name: 'preload declarations expose only manifest-owned methods',
    expected: ipcExposedMethodIdentities,
    actual: collectPreloadDeclarationMethodIdentities(preloadDeclarationSurface)
  }));
  checks.push(compareSortedValues({
    name: 'preload global declarations match manifest API globals',
    expected: collectManifestGlobalApiTypeEntries(manifests.ipc, preloadDeclarationSurface),
    actual: collectPreloadDeclarationGlobalApiTypeEntries(preloadDeclarationSurface)
  }));
  checks.push(compareSortedValues({
    name: 'ipc manifest invoke public signatures match preload declaration signatures',
    expected: collectPreloadDeclarationSignatureEntries(
      manifests.ipc,
      preloadDeclarationSurface,
      'invoke',
      createInvokeManifestSignature,
      extractInvokeDeclarationSignature
    ),
    actual: collectIpcManifestSignatureEntries(manifests.ipc, 'invoke', createInvokeManifestSignature)
  }));
  checks.push(compareSortedValues({
    name: 'ipc manifest subscription public signatures match preload declaration signatures',
    expected: collectPreloadDeclarationSignatureEntries(
      manifests.ipc,
      preloadDeclarationSurface,
      'subscriptions',
      createSubscriptionManifestSignature,
      extractSubscriptionDeclarationSignature
    ),
    actual: collectIpcManifestSignatureEntries(manifests.ipc, 'subscriptions', createSubscriptionManifestSignature)
  }));

  const preloadIndexSource = readProjectText('src/preload/index.js');
  const currentPreloadExposures = extractPreloadExposures(preloadIndexSource, manifests.ipc);
  const manifestPreloadExposures = collectIpcManifestMethods(manifests.ipc);
  checks.push(createDerivedSourceCheck({
    name: 'preload index delegates exposure shape to manifest factory',
    sourceText: preloadIndexSource,
    requiredFragments: [
      "@preload/exposure.factory.js",
      "exposePreloadApis(contextBridge"
    ]
  }));
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
  checks.push(createModeCheck('event manifest is enforced', manifests.events.mode));
  checks.push(compareSortedValues({
    name: 'renderer event manifest payloads match EventPayloadMap',
    expected: collectEventPayloadMapEntries(
      readProjectText('src/shared/events/event-payloads.ts'),
      readProjectText('src/shared/events/event-channels.ts')
    ),
    actual: collectEventManifestPayloadEntries(manifests.events)
  }));

  checks.push(compareSortedValues({
    name: 'main event manifest matches MainEventChannels values',
    expected: collectMainEventChannelValues(
      readProjectText('src/main/infrastructure/events/event-channels.config.ts'),
      manifests.events
    ),
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
  checks.push(createModeCheck('device manifest is enforced', manifests.devices.mode));
  checks.push(createDerivedSourceCheck({
    name: 'device registry derives built-in metadata from device manifest',
    sourceText: readProjectText('src/shared/features/devices/device.registry.js'),
    requiredFragments: [
      'DeviceManifest.devices.map',
      'device.modules.profile',
      'device.modules.adapter',
      '[...device.labelPatterns]'
    ]
  }));
  checks.push(createDerivedSourceCheck({
    name: 'Chromatic runtime config derives hardware metadata from device manifest',
    sourceText: readProjectText('src/shared/features/devices/profiles/chromatic/device-chromatic.config.js'),
    requiredFragments: [
      'DeviceManifest.devices.find',
      'CHROMATIC_MANIFEST_ENTRY.usb.vendorId',
      'CHROMATIC_MANIFEST_ENTRY.display.nativeWidth',
      'CHROMATIC_MANIFEST_ENTRY.media.video',
      'CHROMATIC_MANIFEST_ENTRY.labelPatterns'
    ]
  }));
  checks.push(createDerivedSourceCheck({
    name: 'Chromatic E2E fixture derives serialized browser data from device manifest',
    sourceText: readProjectText('tests/support/chromatic-device-specs.js'),
    requiredFragments: [
      'CHROMATIC_DEVICE_MANIFEST_ENTRY.fixture',
      'CHROMATIC_E2E_FIXTURE',
      'usbDeviceInfo',
      'videoDevice',
      'audioDevice',
      'videoSettings',
      'audioSettings'
    ]
  }));
  checks.push(createDerivedSourceCheck({
    name: 'Mock Chromatic helper injects serialized fixture data',
    sourceText: readProjectText('tests/e2e/helpers/mock-chromatic.helper.js'),
    requiredFragments: [
      'CHROMATIC_E2E_FIXTURE',
      '{ fixture: CHROMATIC_E2E_FIXTURE',
      'state.fixture.usbDeviceInfo',
      'const { display, videoDevice, audioDevice, videoSettings, audioSettings } = fixture',
      'streamSettings.defaultFrameRate'
    ]
  }));
  const layoutCss = readProjectText('src/renderer/presentation/styles/layout.css');
  checks.push({
    name: 'stream canvas aspect ratio derives from device manifest resolution',
    status: layoutCss.includes('aspect-ratio: var(--stream-native-aspect-ratio)') &&
      readProjectText('src/renderer/infrastructure/services/streaming/canvas-lifecycle.service.ts')
        .includes('--stream-native-aspect-ratio') &&
      !/aspect-ratio\s*:\s*160\s*\/\s*144/.test(layoutCss)
      ? 'pass'
      : 'fail',
    expected: 'CSS variable populated from native resolution',
    actual: layoutCss.includes('aspect-ratio: var(--stream-native-aspect-ratio)')
      ? 'css-variable'
      : 'manual-or-missing',
    missing: layoutCss.includes('aspect-ratio: var(--stream-native-aspect-ratio)')
      ? []
      : ['aspect-ratio: var(--stream-native-aspect-ratio)'],
    extra: /aspect-ratio\s*:\s*160\s*\/\s*144/.test(layoutCss) ? ['aspect-ratio: 160 / 144'] : []
  });
  checks.push(createGeneratedBlockCheck({
    name: 'phase 1 manifest docs block is current',
    sourceText: readProjectText('docs/feature-map.md'),
    markerName: 'CODEBASE_PHASE1_MANIFESTS',
    expectedBlock: createDocsFragment(manifests)
  }));
  checks.push(createGeneratedBlockCheck({
    name: 'feature map generated manifest block is current',
    sourceText: readProjectText('docs/feature-map.md'),
    markerName: 'CODEBASE_FEATURE_MAP',
    expectedBlock: createFeatureMapGeneratedBlock(manifests)
  }));

  const storageConfigSource = readProjectText('src/shared/config/storage-keys.config.ts');
  const derivesSettingsKeys = storageConfigDerivesSettingsKeys(storageConfigSource);
  checks.push({
    name: 'storage protected keys derive from settings manifest',
    status: derivesSettingsKeys ? 'pass' : 'fail',
    expected: 'SettingsDefinitions.definitions storageKey derivation',
    actual: derivesSettingsKeys ? 'derived' : 'manual-or-missing',
    missing: derivesSettingsKeys ? [] : ['SETTINGS_STORAGE_KEYS derived from SettingsDefinitions.definitions'],
    extra: []
  });

  const defaults = collectManifestDefaults(manifests.settings);
  checks.push({
    name: 'settings manifest records recording format default',
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

  const renderPassesMissingUniformMetadata = manifests.renderPasses.passes
    .filter((pass) => !renderPassOwnsUniformMetadata(pass))
    .map((pass) => pass.id);
  checks.push({
    name: 'render pass manifest owns uniform upload metadata',
    status: renderPassesMissingUniformMetadata.length === 0 ? 'pass' : 'fail',
    expectedCount: manifests.renderPasses.passes.length,
    actualCount: manifests.renderPasses.passes.length - renderPassesMissingUniformMetadata.length,
    missing: renderPassesMissingUniformMetadata,
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
  checks.push(createDerivedSourceCheck({
    name: 'build matrix derives platform entries from platform manifest',
    sourceText: readProjectText('scripts/ci/build-matrix.mjs'),
    requiredFragments: [
      'platforms.manifest.json',
      'manifest.platformGroups',
      'manifest.smokeInputAliases',
      'platform.buildScript',
      'platform.label'
    ]
  }));
  checks.push(compareSortedValues({
    name: 'platform manifest labels match release build matrix',
    expected: releaseLabels,
    actual: manifests.platforms.platforms.map((platform) => platform.label)
  }));

  const smokeLabels = runBuildMatrix(['--mode', 'smoke', '--platform', 'all']).map((entry) => entry.label);
  checks.push(createDerivedSourceCheck({
    name: 'smoke test executable discovery derives from platform manifest',
    sourceText: readProjectText('scripts/smoke-test.js'),
    requiredFragments: [
      'platforms.manifest.json',
      'resolveSmokePlatformEntry',
      'smokeExecutablePriority',
      'nodePlatformPrefix'
    ]
  }));
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
      preloadDeclaration: generatedPreloadDeclaration,
      docsFragment: createDocsFragment(manifests),
      featureMapFragment: createFeatureMapGeneratedBlock(manifests)
    }
  };
}

function printSummary(report) {
  console.log('Codebase Size Reduction Phase 1 Drift Report');
  console.log(`- status: ${report.status}`);
  for (const check of report.checks) console.log(`- ${check.status}: ${check.name}`);
}

function writeGeneratedOutputs(generated) {
  const outputRoot = resolveProjectPath('artifacts/codebase-reduction/phase1');
  return {
    declarationPath: writeGeneratedArtifact({ outputRoot, relativePath: 'preload-api.generated-preview.d.ts', contents: generated.preloadDeclaration }),
    docsPath: writeGeneratedArtifact({ outputRoot, relativePath: 'manifest-docs.fragment.md', contents: generated.docsFragment }),
    featureMapPath: writeGeneratedArtifact({ outputRoot, relativePath: 'feature-map.generated.md', contents: generated.featureMapFragment })
  };
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
    for (const [label, outputPath] of Object.entries({
      'declaration preview': outputs.declarationPath,
      'docs fragment': outputs.docsPath,
      'feature-map fragment': outputs.featureMapPath
    })) console.log(`Wrote generated ${label}: ${outputPath}`);
  }

  if (options.json) console.log(JSON.stringify(report, null, 2));
  else printSummary(report);
  process.exit(report.status === 'pass' ? 0 : 1);
}

const invokedScript = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedScript) {
  main();
}

export { buildPhase1DriftReport, collectIpcManifestChannels, collectIpcManifestMethods, collectEventManifestValues, createDocsFragment, createFeatureMapGeneratedBlock, createPreloadDeclarationPreview, extractPreloadExposures, loadManifests, writeGeneratedOutputs };
