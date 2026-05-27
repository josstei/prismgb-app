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
import { compareSortedValues } from './lib/manifest-drift.js';
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
function collectIpcManifestEntries(ipcManifest) { return ipcManifest.namespaces.flatMap((namespace) => [...(namespace.invoke || []), ...(namespace.subscriptions || [])].map((entry) => ({ namespace, entry }))); }
function collectIpcManifestChannels(ipcManifest) { return collectIpcManifestEntries(ipcManifest).map(({ entry }) => entry.channel); }
function collectIpcManifestChannelMap(ipcManifest) { return Object.fromEntries(ipcManifest.namespaces.map((namespace) => [namespace.namespace, Object.fromEntries([...(namespace.invoke || []), ...(namespace.subscriptions || [])].filter((entry) => entry.channelKey && entry.channel).map((entry) => [entry.channelKey, entry.channel]))])); }
const ipcChannelMapBlockMarker = 'CODEBASE_IPC_CHANNEL_MAP';
function createIpcChannelMapBlock(ipcManifest) { const namespaces = ipcManifest.namespaces, rows = namespaces.map((namespace, index) => `  ${namespace.namespace}: { ${[...(namespace.invoke || []), ...(namespace.subscriptions || [])].map((entry) => `${entry.channelKey}: ${quotedTsString(entry.channel)}`).join(', ')} }${index === namespaces.length - 1 ? '' : ','}`); return [`// ${ipcChannelMapBlockMarker}:START`, 'export const IPC_CHANNELS = {', ...rows, '} as const;', '', 'export type IpcChannels = typeof IPC_CHANNELS;', `// ${ipcChannelMapBlockMarker}:END`].join('\n'); }
function collectIpcManifestMethods(ipcManifest) { return Object.fromEntries(ipcManifest.namespaces.map((namespace) => [namespace.apiName, namespace.exposedMethods || []])); }
const resolveIpcChannelFromKey = (ipcChannels, namespaceKey, channelKey) => ipcChannels[namespaceKey]?.[channelKey] || `IPC_CHANNELS.${namespaceKey}.${channelKey}`;
function collectIpcManifestChannelKeyEntries(ipcManifest, resolveChannel) { return collectIpcManifestEntries(ipcManifest).map(({ namespace, entry }) => `${namespace.namespace}.${entry.channelKey} ${resolveChannel(namespace, entry)}`); }
function collectIpcManifestSignatureEntries(ipcManifest, section, createManifestSignature) { return ipcManifest.namespaces.flatMap((namespace) => (namespace[section] || []).map((entry) => `${entry.channel} ${createManifestSignature(entry)}`)); }
const normalizeRegistryMetadataValue = (value) => typeof value === 'string' ? value.trim() : '';
const derivePublicMethodName = (entry) => normalizeRegistryMetadataValue(entry.factoryMethod || entry.method);
function collectIpcManifestOwnedMethodIdentities(ipcManifest) { return collectIpcManifestEntries(ipcManifest).map(({ namespace, entry }) => `${namespace.apiName}.${derivePublicMethodName(entry)}`); }
function createSubscriptionRegistryMetadataCheck(ipcManifest) {
  const name = 'ipc manifest subscription registry namespaces are explicit';
  const registryMetadata = ipcManifest.namespaces.flatMap((namespace) => (namespace.subscriptions || []).map((entry) => {
    const methodName = derivePublicMethodName(entry);
    const registryNamespace = normalizeRegistryMetadataValue(namespace.registryNamespace);
    return { methodIdentity: `${namespace.apiName}.${methodName || 'unknown'}`, methodName, registryNamespace };
  }));
  const validRegistryMetadata = registryMetadata.filter(({ methodName, registryNamespace }) => methodName && registryNamespace);
  const metadataCheck = compareSortedValues({ name, expected: registryMetadata.map(({ methodIdentity }) => methodIdentity), actual: validRegistryMetadata.map(({ methodIdentity }) => methodIdentity) });
  const derivedRegistryKeys = validRegistryMetadata.map(({ methodName, registryNamespace }) => `${registryNamespace}.${methodName}`);
  const duplicateRegistryKeyCheck = compareSortedValues({ name, expected: [...new Set(derivedRegistryKeys)], actual: derivedRegistryKeys });
  return { ...metadataCheck, status: metadataCheck.status === 'pass' && duplicateRegistryKeyCheck.status === 'pass' ? 'pass' : 'fail', extra: [...metadataCheck.extra, ...duplicateRegistryKeyCheck.extra] };
}
function collectPreloadDeclarationMethodIdentities({ interfaces, windowApis }) { return [...windowApis.entries()].flatMap(([apiName, interfaceName]) => [...(interfaces.get(interfaceName) || new Map()).entries()].flatMap(([method, signatures]) => signatures.map(() => `${apiName}.${method}`))); }
function collectPreloadDeclarationGlobalApiTypeEntries({ globalApis }) {
  return globalApis.filter(({ apiName }) => apiName.endsWith('API')).map(({ apiName, type }) => `${apiName} ${type}`);
}
function collectPreloadDeclarationWindowApiEntries({ windowApiEntries }) {
  return windowApiEntries.filter(({ apiName }) => apiName.endsWith('API')).map(({ apiName, optional, type }) => `${apiName}${optional ? '?' : ''}: ${type}`);
}
function collectManifestGlobalApiTypeEntries(ipcManifest, { windowApis }) { return ipcManifest.namespaces.map((namespace) => `${namespace.apiName} ${windowApis.get(namespace.apiName) || 'missing-window-api'} | undefined`); }
function collectManifestWindowApiEntries(ipcManifest) { return ipcManifest.namespaces.map((namespace) => `${namespace.apiName}?: ${apiInterfaceName(namespace.apiName)}`); }
function propertyName(node, sourceFile) { return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : node?.getText(sourceFile) || null; }
function staticStringValue(node) { const value = unwrappedExpression(node); if (!value) return null; if (ts.isStringLiteralLike(value)) return value.text; if (!ts.isBinaryExpression(value) || value.operatorToken.kind !== ts.SyntaxKind.PlusToken) return null; const left = staticStringValue(value.left), right = staticStringValue(value.right); return left === null || right === null ? null : `${left}${right}`; }
function resolvedPropertyName(node, sourceFile) { if (!node) return { name: null, unresolvedComputed: false }; if (ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return { name: node.text, unresolvedComputed: false }; if (!ts.isComputedPropertyName(node)) return { name: node?.getText(sourceFile) || null, unresolvedComputed: false }; const resolvedName = staticStringValue(node.expression); return { name: resolvedName, unresolvedComputed: resolvedName === null }; }
function hasLocalBinding(sourceFile, names) {
  let found = false;
  const bindingHasName = (name) => ts.isIdentifier(name) ? names.has(name.text) : ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name) ? name.elements.some((element) => element.name && bindingHasName(element.name)) : false;
  const visit = (node) => {
    if (found) return;
    const importClause = ts.isImportDeclaration(node) ? node.importClause : null;
    const importBindings = importClause?.namedBindings || null;
    if (
      (ts.isVariableDeclaration(node) || ts.isParameter(node)) && bindingHasName(node.name)
      || (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name && names.has(node.name.text)
      || importClause && (
        importClause.name && names.has(importClause.name.text)
        || importBindings && ts.isNamedImports(importBindings) && importBindings.elements.some((element) => names.has(element.name.text))
        || importBindings && ts.isNamespaceImport(importBindings) && names.has(importBindings.name.text)
      )
    ) found = true;
    else ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}
function hasNonImportBinding(sourceFile, names) { let found = false; const bindingHasName = (name) => ts.isIdentifier(name) ? names.has(name.text) : ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name) ? name.elements.some((element) => element.name && bindingHasName(element.name)) : false, visit = (node) => { if (found) return; if ((ts.isVariableDeclaration(node) || ts.isParameter(node)) && bindingHasName(node.name) || (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name && names.has(node.name.text)) found = true; else ts.forEachChild(node, visit); }; visit(sourceFile); return found; }
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
      const methodSignatures = methods.get(derivePublicMethodName(entry)) || [];
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
function collectIpcManifestHandlerMetadataEntries(ipcManifest, validateMetadata = false) {
  const valid = (metadata) => metadata && Array.isArray(metadata.dependencyTokens) && metadata.dependencyTokens.every((token) => typeof token === 'string' && token.trim()) && ['bare', 'result-envelope'].includes(metadata.responseMode);
  return ipcManifest.namespaces.flatMap((namespace) => (namespace.invoke || []).flatMap((entry) => !validateMetadata || valid(entry.handler) ? [entry.channel] : []));
}
function resolveManifestBackedHandlerSources(options = {}) {
  if (Array.isArray(options.handlerSources) && options.handlerSources.length > 0) return options.handlerSources;
  const overrideByPath = options.handlerSourceOverrides && typeof options.handlerSourceOverrides === 'object' ? options.handlerSourceOverrides : {};
  const handlersRoot = resolveProjectPath('src/main/ipc/handlers');
  return fs.readdirSync(handlersRoot).filter((fileName) => fileName.endsWith('.handler.ts')).sort().map((fileName) => {
    const filePath = `src/main/ipc/handlers/${fileName}`;
    return { filePath, sourceText: Object.prototype.hasOwnProperty.call(overrideByPath, filePath) ? String(overrideByPath[filePath] ?? '') : fs.readFileSync(path.join(handlersRoot, fileName), 'utf8') };
  });
}
function collectEventManifestValues(eventManifest, scope) {
  return eventManifest.scopes.filter((entry) => entry.scope === scope).flatMap((entry) => entry.events.map((event) => event.value));
}
function normalizePayloadType(payloadType) { return String(payloadType).replace(/\s+/g, ' ').trim(); }
const eventKeyPart = (value) => value.toUpperCase().replace(/-/g, '_'), isSatisfiesExpression = typeof ts.isSatisfiesExpression === 'function' ? ts.isSatisfiesExpression : () => false;
const eventChannelAccess = (event) => `EventChannels.${eventKeyPart(event.domain)}.${eventKeyPart(event.name)}`, rendererBridgeEventValue = (event) => event ? `${event.domain}:${event.name}` : null;
const quotedTsString = (value) => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const preloadMethodContractBlockMarker = 'CODEBASE_PRELOAD_METHOD_CONTRACT', preloadPayloadValidatorBlockMarker = 'CODEBASE_PRELOAD_PAYLOAD_VALIDATORS', preloadInvokeArgumentValidatorBlockMarker = 'CODEBASE_PRELOAD_INVOKE_ARGUMENT_VALIDATORS', preloadPayloadValidatorFunctions = { 'device-info': 'isValidDeviceInfo', 'nullable-device-info': 'isValidNullableDeviceInfo', 'update-info': 'isValidUpdateInfo', 'update-progress': 'isValidProgress', 'update-error': 'isValidError', 'transcode-progress': 'isValidTranscodeProgress', 'transcode-completed': 'isValidTranscodeResult', 'transcode-error': 'isValidError', 'transcode-cancelled': 'isValidTranscodeCancelled' };
function createPreloadMethodContractBlock(ipcManifest) { const namespaces = ipcManifest.namespaces, apiNames = namespaces.map((namespace) => quotedTsString(namespace.apiName)).join(', '), methodRows = (section) => { const sections = namespaces.filter((namespace) => (namespace[section] || []).length > 0); return sections.map((namespace, index) => `  ${namespace.apiName}: [${(namespace[section] || []).map((entry) => quotedTsString(derivePublicMethodName(entry))).join(', ')}]${index === sections.length - 1 ? '' : ','}`); }; return [`// ${preloadMethodContractBlockMarker}:START`, `const preloadApiNames = [${apiNames}] as const satisfies readonly (Extract<keyof Window, \`\${string}API\`>)[];`, 'export type PreloadApiName = (typeof preloadApiNames)[number];', 'type ApiSurface<TApiName extends PreloadApiName> = NonNullable<Window[TApiName]>;', 'type ApiMethodName<TApiName extends PreloadApiName> = Extract<keyof ApiSurface<TApiName>, string>;', 'type InvokeMethodName<TApiName extends PreloadApiName> = Exclude<ApiMethodName<TApiName>, `on${string}`>;', 'type SubscriptionMethodName<TApiName extends PreloadApiName> = Extract<ApiMethodName<TApiName>, `on${string}`>;', 'type InvokeApiName = { [TApiName in PreloadApiName]: InvokeMethodName<TApiName> extends never ? never : TApiName }[PreloadApiName];', 'type SubscriptionApiName = { [TApiName in PreloadApiName]: SubscriptionMethodName<TApiName> extends never ? never : TApiName }[PreloadApiName];', 'type InvokeMethods<TApiName extends InvokeApiName> = Pick<ApiSurface<TApiName>, InvokeMethodName<TApiName>>;', 'type SubscriptionMethods<TApiName extends SubscriptionApiName> = Pick<ApiSurface<TApiName>, SubscriptionMethodName<TApiName>>;', 'type InvokeFactoryContext = { apiName: string; methodName: string; channel: string; ipcRenderer: InvokeIpcRenderer; manifestEntry: ManifestInvokeEntry };', 'type InvokeMethodFactory<TMethod extends GeneratedMethod = GeneratedMethod> = (context: InvokeFactoryContext) => TMethod;', 'type InvokeMethodFactories<TApiName extends InvokeApiName> = Partial<{ [TMethodName in keyof InvokeMethods<TApiName>]: InvokeMethodFactory<Extract<InvokeMethods<TApiName>[TMethodName], GeneratedMethod>> }>;', 'const invokeMethodNamesByApi = {', ...methodRows('invoke'), '} as const satisfies { readonly [TApiName in InvokeApiName]: readonly InvokeMethodName<TApiName>[] };', 'const subscriptionMethodNamesByApi = {', ...methodRows('subscriptions'), '} as const satisfies { readonly [TApiName in SubscriptionApiName]: readonly SubscriptionMethodName<TApiName>[] };', 'type MissingInvokeMethodName = { [TApiName in InvokeApiName]: `${TApiName}.${Exclude<InvokeMethodName<TApiName>, (typeof invokeMethodNamesByApi)[TApiName][number]>}` }[InvokeApiName];', 'type MissingSubscriptionMethodName = { [TApiName in SubscriptionApiName]: `${TApiName}.${Exclude<SubscriptionMethodName<TApiName>, (typeof subscriptionMethodNamesByApi)[TApiName][number]>}` }[SubscriptionApiName];', 'type AssertNoMissingGeneratedMethods<TMissing extends never> = TMissing;', 'export type PreloadMethodContractIsComplete = [AssertNoMissingGeneratedMethods<MissingInvokeMethodName>, AssertNoMissingGeneratedMethods<MissingSubscriptionMethodName>];', `// ${preloadMethodContractBlockMarker}:END`].join('\n'); }
function createPreloadPayloadValidatorBlock(ipcManifest) { const validatorNames = [...new Set(ipcManifest.namespaces.flatMap((namespace) => (namespace.subscriptions || []).flatMap((entry) => { const name = typeof entry.preload?.payloadValidator?.name === 'string' && entry.preload.payloadValidator.name.trim() ? entry.preload.payloadValidator.name.trim() : ''; return !entry.payload || entry.payload === 'void' ? [] : [name || `missing-${namespace.apiName}-${derivePublicMethodName(entry)}`]; })))]; return [`// ${preloadPayloadValidatorBlockMarker}:START`, 'const preloadPayloadValidators = {', ...validatorNames.map((name, index) => `  ${quotedTsString(name)}: ${preloadPayloadValidatorFunctions[name] || 'missingPreloadPayloadValidator'}${index === validatorNames.length - 1 ? '' : ','}`), '} as const satisfies Record<string, PayloadValidator>;', 'type PreloadSubscriptionPayloadValidatorName = keyof typeof preloadPayloadValidators;', `// ${preloadPayloadValidatorBlockMarker}:END`].join('\n'); } function createPreloadPayloadValidatorMetadataCheck(ipcManifest) { const expected = [], actual = [], extra = [], byPayload = new Map(); for (const namespace of ipcManifest.namespaces) for (const entry of namespace.subscriptions || []) { const payload = normalizePayloadType(entry.payload || ''); if (!payload || payload === 'void') continue; const method = `${namespace.apiName}.${derivePublicMethodName(entry)}`, metadata = entry.preload?.payloadValidator, name = typeof metadata?.name === 'string' ? metadata.name.trim() : '', label = typeof metadata?.invalidPayloadLabel === 'string' ? metadata.invalidPayloadLabel.trim() : ''; expected.push(method); if (!name || !label || !preloadPayloadValidatorFunctions[name]) { extra.push(`${method}: ${!metadata ? 'payloadValidator missing' : !name ? 'name missing' : !label ? 'label missing' : `unknown ${name}`}`); continue; } actual.push(method); const key = `${name} ${label}`, existing = byPayload.get(payload); if (existing && existing !== key) extra.push(`${payload}: inconsistent payloadValidator ${existing} vs ${key}`); byPayload.set(payload, key); } const check = compareSortedValues({ name: 'preload subscription payload validator metadata is manifest-owned', expected, actual }); return { ...check, status: check.status === 'pass' && extra.length === 0 ? 'pass' : 'fail', extra: [...check.extra, ...extra] }; }
function createPreloadInvokeArgumentValidatorBlock(ipcManifest) { const entries = ipcManifest.namespaces.flatMap((namespace) => (namespace.invoke || []).flatMap((entry) => entry.preload ? [[`${namespace.apiName}.${derivePublicMethodName(entry)}`, (entry.preload.argumentValidators || []).map((validator) => validator.name)]] : [])); return [`// ${preloadInvokeArgumentValidatorBlockMarker}:START`, 'const preloadInvokeArgumentValidatorNamesByMethod = {', ...entries.map(([method, validators], index) => `  ${quotedTsString(method)}: [${validators.map(quotedTsString).join(', ')}]${index === entries.length - 1 ? '' : ','}`), '} as const satisfies PreloadInvokeArgumentValidatorExpectationByMethod;', `// ${preloadInvokeArgumentValidatorBlockMarker}:END`].join('\n'); }
const rendererEventDomainComments = new Map([['system', 'System events (EventBus internals)'], ['device', 'Device events'], ['stream', 'Stream events'], ['capture', 'Capture events'], ['settings', 'Settings events'], ['render', 'Render events (GPU rendering pipeline)'], ['ui', 'UI events'], ['update', 'Update events'], ['notes', 'Notes events'], ['transcode', 'Transcode events']]);
const eventChannelsBlockMarker = 'CODEBASE_RENDERER_EVENT_CHANNELS';
const eventChannelsPrelude = ['/**', ' * Event channel constants shared across renderer layers.', ' *', ' * This is the source-of-truth contract for EventBus topic names.', ' */', "import { getEventManifestScopeEvents, toManifestEventKey } from './event.manifest.js';", '', 'const rendererEventChannelsByKey = new Map(', "  getEventManifestScopeEvents('renderer').map((entry) => [", '    toManifestEventKey(entry.domain, entry.name),', '    entry.value', '  ] as const)', ');', '', 'function getRendererChannel<const TDomain extends string, const TName extends string>(', '  domain: TDomain,', '  name: TName', '): `${TDomain}:${TName}` {', '  const key = toManifestEventKey(domain, name) as `${TDomain}:${TName}`;', '  const manifestValue = rendererEventChannelsByKey.get(key);', '', '  if (!manifestValue) {', '    throw new Error(`Renderer event "${key}" not found in event manifest`);', '  }', '', '  // Keep the runtime value contract strict: value must match domain:name key form.', '  if (manifestValue !== key) {', '    throw new Error(`Renderer event "${key}" has mismatched manifest value "${manifestValue}"`);', '  }', '', '  return manifestValue as `${TDomain}:${TName}`;', '}', '', `// ${eventChannelsBlockMarker}:START`, 'export const EventChannels = {'].join('\n');
function collectRendererEventDomainGroups(eventManifest) {
  const groups = new Map();
  for (const event of eventManifest.scopes.find((scope) => scope.scope === 'renderer')?.events || []) {
    if (!groups.has(event.domain)) groups.set(event.domain, []);
    groups.get(event.domain).push(event);
  }
  return [...groups.entries()].map(([domain, events]) => ({ domain, events }));
}
function createEventChannelsPreview(eventManifest) {
  const lines = eventChannelsPrelude.split('\n');
  const groups = collectRendererEventDomainGroups(eventManifest);
  groups.forEach(({ domain, events }, domainIndex) => {
    const comment = rendererEventDomainComments.get(domain);
    if (comment) lines.push(`  // ${comment}`);
    lines.push(`  ${eventKeyPart(domain)}: {`);
    events.forEach((event, index) => {
      if (event.domain === 'ui' && event.name === 'screenshot-requested') lines.push('    // UI command events (decoupled from orchestrators)');
      lines.push(`    ${eventKeyPart(event.name)}: getRendererChannel(${quotedTsString(event.domain)}, ${quotedTsString(event.name)})${index === events.length - 1 ? '' : ','}`);
    });
    lines.push(`  }${domainIndex === groups.length - 1 ? '' : ','}`);
    if (domainIndex < groups.length - 1) lines.push('');
  });
  lines.push('} as const;', `// ${eventChannelsBlockMarker}:END`, '');
  return lines.join('\n');
}
const eventPayloadBlockMarker = 'CODEBASE_EVENT_PAYLOAD_MAP';
const compactEventPayloadMapType = 'export type EventPayloadMap = {\n  [K in EventChannelValue]: K extends keyof EventPayloadOverrides\n    ? EventPayloadOverrides[K]\n    : K extends VoidEventChannel\n      ? void\n      : unknown;\n};';
const findTopLevelTypeAlias = (sourceFile, aliasName, exported = false) => { const matches = sourceFile.statements.filter((node) => ts.isTypeAliasDeclaration(node) && node.name.text === aliasName && (!exported || node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))); return matches.length === 1 ? matches[0] : null; };
const getTypeAliasText = (sourceText, aliasName, filePath = 'source.ts', exported = false) => { const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true), alias = findTopLevelTypeAlias(sourceFile, aliasName, exported); return alias ? alias.getText(sourceFile) : ''; };
function extractEventPayloadGeneratedBlock(sourceText) { const sourceFile = ts.createSourceFile('src/shared/events/event-payloads.ts', sourceText, ts.ScriptTarget.Latest, true), voidAlias = findTopLevelTypeAlias(sourceFile, 'VoidEventChannel'), overridesAlias = findTopLevelTypeAlias(sourceFile, 'EventPayloadOverrides'), startMarker = `// ${eventPayloadBlockMarker}:START`, endMarker = `// ${eventPayloadBlockMarker}:END`; if (!voidAlias || !overridesAlias || voidAlias.getStart(sourceFile) > overridesAlias.getStart(sourceFile)) return null; const typeLineStart = sourceText.lastIndexOf('\n', voidAlias.getStart(sourceFile) - 1) + 1, markerLineStart = sourceText.lastIndexOf('\n', typeLineStart - 2) + 1, markerLine = sourceText.slice(markerLineStart, typeLineStart - 1).trim(), aliasLineEnd = sourceText.indexOf('\n', overridesAlias.end); if (aliasLineEnd === -1) return null; const endLineStart = aliasLineEnd + 1, endLineEnd = sourceText.indexOf('\n', endLineStart), endLine = sourceText.slice(endLineStart, endLineEnd === -1 ? sourceText.length : endLineEnd).trim(); return markerLine === startMarker && endLine === endMarker ? sourceText.slice(markerLineStart, endLineEnd === -1 ? sourceText.length : endLineEnd).trimEnd() : null; }
function createEventPayloadMapBlock(eventManifest) {
  const events = eventManifest.scopes.find((scope) => scope.scope === 'renderer')?.events || [], channelType = (event) => `typeof EventChannels.${eventKeyPart(event.domain)}.${eventKeyPart(event.name)}`, typedEvents = events.filter((event) => normalizePayloadType(event.payload) !== 'unknown' && normalizePayloadType(event.payload) !== 'void');
  return [`// ${eventPayloadBlockMarker}:START`, `type VoidEventChannel = ${events.filter((event) => normalizePayloadType(event.payload) === 'void').map(channelType).join(' | ') || 'never'};`, '', 'type EventPayloadOverrides = {', ...typedEvents.map((event) => `  [EventChannels.${eventKeyPart(event.domain)}.${eventKeyPart(event.name)}]: ${normalizePayloadType(event.payload)};`), '};', `// ${eventPayloadBlockMarker}:END`].join('\n');
}
const collectEventPayloadAliasBlock = (sourceText) => `${getTypeAliasText(sourceText, 'VoidEventChannel')}\n\n${getTypeAliasText(sourceText, 'EventPayloadOverrides')}`;
const stripGeneratedPayloadMarkers = (sourceText) => sourceText.split('\n').slice(1, -1).join('\n');
function unwrappedExpression(node) { while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || isSatisfiesExpression(node) || ts.isNonNullExpression(node))) node = node.expression; return node; }
function resolveEventChannelValueExpression(node) {
  if (!node) return null; if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'getRendererChannel') { const [domainArg, nameArg] = node.arguments; return ts.isStringLiteralLike(domainArg) && ts.isStringLiteralLike(nameArg) ? `${domainArg.text}:${nameArg.text}` : null; }
  return null;
}
function collectEventChannelReferenceValues(sourceText, filePath = 'src/shared/events/event-channels.ts') {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true); if (sourceFile.parseDiagnostics.length > 0) return new Map();
  const channelValues = new Map();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'EventChannels' && node.initializer) {
      const initializer = unwrappedExpression(node.initializer); if (!initializer || !ts.isObjectLiteralExpression(initializer)) return;
      for (const domainProperty of initializer.properties) {
        if (!ts.isPropertyAssignment(domainProperty)) continue;
        const domainName = propertyName(domainProperty.name, sourceFile), domainValue = unwrappedExpression(domainProperty.initializer);
        if (!domainName || !domainValue || !ts.isObjectLiteralExpression(domainValue)) continue;
        for (const channelProperty of domainValue.properties) {
          if (!ts.isPropertyAssignment(channelProperty)) continue;
          const channelKey = propertyName(channelProperty.name, sourceFile), channelValue = resolveEventChannelValueExpression(unwrappedExpression(channelProperty.initializer));
          if (channelKey && channelValue) channelValues.set(`EventChannels.${domainName}.${channelKey}`, channelValue);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return channelValues;
}
function collectEventManifestChannelPathValueEntries(eventManifest, scope) {
  return eventManifest.scopes.filter((entry) => entry.scope === scope).flatMap((entry) => entry.events.map((event) => `${eventChannelAccess(event)} ${event.value}`));
}
const extractStringValuesFromSource = (sourceText) => [...sourceText.matchAll(/['"]([a-z][a-z0-9-]*:[a-z][a-z0-9-]*)['"]/g)].map((match) => match[1]);
function collectRendererEventChannelPathValueEntries(sourceText) { return [...collectEventChannelReferenceValues(sourceText).entries()].map(([pathKey, channelValue]) => `${pathKey} ${channelValue}`); }
function collectMainEventChannelValues(sourceText, eventManifest) {
  const literalValues = extractStringValuesFromSource(sourceText); if (literalValues.length > 0) return literalValues;
  const derivesFromManifest = sourceText.includes('event.manifest.json'), selectsMainScope = /scope\s*===\s*['"]main['"]/.test(sourceText), buildsChannelsFromMainScope = /MainEventChannels/.test(sourceText) && /mainScope\.events/.test(sourceText);
  return derivesFromManifest && selectsMainScope && buildsChannelsFromMainScope ? collectEventManifestValues(eventManifest, 'main') : [];
}
function extractPreloadExposures(sourceText, ipcManifest = null) {
  const usesManifestExposureFactory = sourceText.includes('@preload/exposure.factory.js') && sourceText.includes('exposePreloadApis(contextBridge');
  if (usesManifestExposureFactory) return ipcManifest ? collectIpcManifestMethods(ipcManifest) : {};
  const exposeRegex = /contextBridge\.exposeInMainWorld\('([^']+)',\s*\{([\s\S]*?)\}\);/g;
  const exposures = {};
  for (const match of sourceText.matchAll(exposeRegex)) {
    const [, apiName, body] = match; exposures[apiName] = [...body.matchAll(/^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:/gm)].map((methodMatch) => methodMatch[1]);
  }
  return exposures;
}
function collectManifestDefaults(settingsManifest) { return Object.fromEntries(settingsManifest.definitions.map((definition) => [definition.name, definition.default])); }
function collectManifestStorageKeys(settingsManifest) { return settingsManifest.definitions.map((definition) => definition.storageKey); }
function storageConfigDerivesSettingsKeys(sourceText) { return sourceText.includes('SettingsDefinitions.definitions.map') && sourceText.includes('definition.storageKey') && sourceText.includes('...SETTINGS_STORAGE_KEYS'); }
function collectRenderPassShaderFiles(renderPassManifest) {
  const webgpu = renderPassManifest.passes.map((pass) => `packages/prismgb-gpu/src/infrastructure/webgpu/shaders/${pass.webgpuShader}`);
  const webgl2 = renderPassManifest.passes.map((pass) => `packages/prismgb-gpu/src/infrastructure/webgl2/shaders/${pass.webgl2FragmentShader}`);
  const utilities = renderPassManifest.utilityShaders.map((shader) => `packages/prismgb-gpu/src/infrastructure/webgl2/shaders/${shader.file}`);
  return [...webgpu, ...webgl2, ...utilities];
}
function renderPassOwnsUniformMetadata(pass) { return Boolean(pass.webgpuUniformLayout && typeof pass.webgpuUniformLayout.byteLength === 'number' && Array.isArray(pass.webgpuUniformLayout.members) && pass.webgpuUniformLayout.members.length > 0 && pass.webgpuUniformLayout.members.every((member) => member.source) && pass.webgl2Uniforms && pass.webgl2Uniforms.texture && Array.isArray(pass.webgl2Uniforms.additional)); }
function collectTsconfigAliases(tsconfigPath) { return [...new Set(Object.keys(readProjectJson(tsconfigPath).compilerOptions?.paths || {}).map((alias) => alias.replace(/\/\*$/, '')))]; }
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
      const invokeEntries = (namespace.invoke || []).filter((entry) => derivePublicMethodName(entry) === method);
      const subscriptionEntries = (namespace.subscriptions || []).filter((entry) => derivePublicMethodName(entry) === method);
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
function collectStartupPreferenceNames(settingsManifest) {
  return (settingsManifest.definitions || [])
    .filter((definition) => definition.startupPreference === true)
    .map((definition) => definition.name);
}
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
    `| Startup preferences | ${formatInlineCodeList(collectStartupPreferenceNames(manifests.settings))} |`,
    '<!-- CODEBASE_FEATURE_MAP:END -->',
    ''
  ].join('\n');
}
function createTemplateDomParityChecks(manifests, options = {}) { const templateSources = Array.isArray(options.templateSources) && options.templateSources.length > 0 ? options.templateSources : listFiles(resolveProjectPath('src/renderer/presentation'), (filePath) => filePath.endsWith('.template.ts')).sort().map((filePath) => ({ filePath: path.relative(projectRoot, filePath).split(path.sep).join('/'), sourceText: fs.readFileSync(filePath, 'utf8') })), settingsDefinitions = manifests.settings.definitions || [], templateRefs = [], templateDerivedRefProps = [], templateActions = [], collectTemplateAction = (tag, ref, action) => { if (!tag.includes('${') && !ref.includes('$') && !action.includes('$')) templateActions.push(`${ref} ${action}`); }; for (const { sourceText } of templateSources) { const templateSection = (name) => { const start = sourceText.indexOf(`function ${name}`), end = sourceText.indexOf('\n}\n\nfunction ', start + 1); return start === -1 ? '' : sourceText.slice(start, end === -1 ? sourceText.length : end); }; for (const match of sourceText.matchAll(/\bdata-ref="([^"$]+)"/g)) templateRefs.push(match[1]); for (const [controlType, sourceSection] of [['checkbox', templateSection('createCheckboxSettingTemplate')], ['listbox', templateSection('createListboxSettingTemplate')]]) for (const match of sourceSection.matchAll(/data-ref="\$\{ui\.([^}]+)\}"/g)) templateDerivedRefProps.push([controlType, match[1]]); for (const match of sourceText.matchAll(/<[^>]*\bdata-ref="([^"$]+)"[^>]*\bdata-action="([^"$]+)"[^>]*>/g)) collectTemplateAction(match[0], match[1], match[2]); for (const match of sourceText.matchAll(/<[^>]*\bdata-action="([^"$]+)"[^>]*\bdata-ref="([^"$]+)"[^>]*>/g)) collectTemplateAction(match[0], match[2], match[1]); } for (const definition of settingsDefinitions) if (definition.ui?.controlId && definition.ui?.controlType) for (const [controlType, prop] of templateDerivedRefProps) if (definition.ui.controlType === controlType) templateRefs.push(definition.ui[prop] || `${controlType}.${prop}.missing`); const contractSource = options.templateDomContractSource || readProjectText('src/renderer/presentation/generated/template-dom.generated.ts'), refBlock = contractSource.slice(contractSource.indexOf('export const TemplateDomRefGroups = {'), contractSource.indexOf('export const TemplateRefLegacyIds')), actionBlock = contractSource.slice(contractSource.indexOf('export const TemplateActionTargets = ['), contractSource.indexOf('] as const satisfies readonly TemplateActionTarget[];')), componentSliceBlock = contractSource.slice(contractSource.indexOf('export interface RendererTemplateComponentElementSlices {'), contractSource.indexOf('export type RendererTemplateComponentId')), componentFactoryBlock = contractSource.slice(contractSource.indexOf('const TemplateComponentElementFactories = {'), contractSource.indexOf('} as const satisfies {', contractSource.indexOf('const TemplateComponentElementFactories = {'))), componentSliceIds = [...componentSliceBlock.matchAll(/\b([A-Za-z0-9]+):\s*[A-Z][A-Za-z0-9]+/g)].map((match) => match[1]), componentIds = ['RendererTemplateCoreComponentIds', 'RendererTemplateDeferredComponentIds'].flatMap((name) => { const start = contractSource.indexOf(`export const ${name} = [`), end = contractSource.indexOf('] as const', start); return start === -1 || end === -1 ? [] : [...contractSource.slice(start, end).matchAll(/'([^']+)'/g)].map((match) => match[1]); }), componentFactoryIds = [...componentFactoryBlock.matchAll(/\b([A-Za-z0-9]+):\s*\(dom\)\s*=>/g)].map((match) => match[1]), catalogSource = options.uiComponentCatalogSource || readProjectText('src/renderer/presentation/controller/ui-component.catalog.ts'), catalogStart = catalogSource.indexOf('const rendererUiComponentDefinitionInputsById = {'), catalogEnd = catalogSource.indexOf('} as const satisfies RendererUiComponentFactoryDefinitionById', catalogStart), catalogBlock = catalogStart === -1 || catalogEnd === -1 ? '' : catalogSource.slice(catalogStart, catalogEnd), catalogIds = [...catalogBlock.matchAll(/^\s{2}([A-Za-z0-9]+):\s*\{/gm)].map((match) => match[1]), catalogGeneratedStageFragments = ['RendererTemplateCoreComponentIds', 'getRendererUiComponentStage'].filter((fragment) => catalogSource.includes(fragment)), catalogDuplicatedMetadata = [...catalogBlock.matchAll(/\b(?:id|stage):\s*['"]/g)].map((match) => match[0]), generatedRefs = [...refBlock.matchAll(/'([^']+)'/g)].map((match) => match[1]), expectedActions = [...actionBlock.matchAll(/\{ ref: '([^']+)', action: '([^']+)'(?:, events: \[[^\]]*\])? \}/g)].map((match) => `${match[1]} ${match[2]}`), expectedActionEvents = [...new Set([...actionBlock.matchAll(/\{ ref: '[^']+', action: '([^']+)', events: \[([^\]]*)\] \}/g)].flatMap((match) => [...match[2].matchAll(/'([^']+)'/g)].map((eventMatch) => `${match[1]} ${eventMatch[1]}`)))], actionSource = options.uiActionContractSource || readProjectText('src/renderer/presentation/primitives/template-ref.utils.ts'), actionIdValues = Object.fromEntries([...actionSource.matchAll(/\b([A-Z][A-Z0-9_]+): '([^']+)'/g)].map((match) => [match[1], match[2]])), descriptorActionEvents = [...actionSource.matchAll(/action: UIActionIds\.([A-Z][A-Z0-9_]+), event: '([^']+)'/g)].map((match) => `${actionIdValues[match[1]]} ${match[2]}`).filter((entry) => expectedActionEvents.includes(entry)); return [compareSortedValues({ name: 'renderer template data-ref attributes match generated DOM contract refs', expected: generatedRefs.sort(), actual: templateRefs.sort() }), compareSortedValues({ name: 'renderer template data-action attributes match generated action contract', expected: expectedActions.sort(), actual: templateActions.sort() }), compareSortedValues({ name: 'renderer template data-action targets have executable event descriptors', expected: expectedActionEvents.sort(), actual: descriptorActionEvents.sort() }), compareSortedValues({ name: 'renderer template component ids match generated element slices', expected: componentSliceIds.sort(), actual: componentIds.sort() }), compareSortedValues({ name: 'renderer template component element factories match generated element slices', expected: componentSliceIds.sort(), actual: componentFactoryIds.sort() }), compareSortedValues({ name: 'renderer UI component catalog definitions match generated element slices', expected: componentSliceIds.sort(), actual: catalogIds.sort() }), compareSortedValues({ name: 'renderer UI component catalog derives stage from generated component ids', expected: ['RendererTemplateCoreComponentIds', 'getRendererUiComponentStage'], actual: catalogGeneratedStageFragments }), compareSortedValues({ name: 'renderer UI component catalog does not duplicate generated id or stage metadata', expected: [], actual: catalogDuplicatedMetadata })]; }
function extractMarkedBlock(sourceText, markerName) { for (const [start, end] of [[`<!-- ${markerName}:START -->`, `<!-- ${markerName}:END -->`], [`// ${markerName}:START`, `// ${markerName}:END`]]) { const startIndex = sourceText.indexOf(start), endIndex = sourceText.indexOf(end); if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) return sourceText.slice(startIndex, endIndex + end.length).trimEnd(); } return null; }
function loadManifests() { return Object.fromEntries(Object.entries(manifestPaths).map(([key, manifestPath]) => [key, readProjectJson(manifestPath)])); }
function createDerivedSourceCheck({ name, sourceText, requiredFragments }) { const missingFragments = requiredFragments.filter((fragment) => !sourceText.includes(fragment)); return { name, status: missingFragments.length === 0 ? 'pass' : 'fail', expectedCount: requiredFragments.length, actualCount: requiredFragments.length - missingFragments.length, missing: missingFragments, extra: [] }; }
const rendererPreloadBridgeDescriptorBlockMarker = 'CODEBASE_RENDERER_PRELOAD_BRIDGE_DESCRIPTORS';
function collectRendererBridgeNamespaces(ipcManifest) { return ipcManifest.namespaces.filter((namespace) => (namespace.subscriptions || []).length > 0); }
function normalizeRendererManifestBridgeConsumerEntry(consumer) { if (typeof consumer === 'string') return { filePath: consumer, mode: 'bridge', lifecycle: 'replace' }; if (!consumer || typeof consumer !== 'object') return null; const filePath = typeof consumer.filePath === 'string' ? consumer.filePath : typeof consumer.consumerFile === 'string' ? consumer.consumerFile : null, mode = consumer.mode === 'direct' ? 'direct' : 'bridge', lifecycle = consumer.lifecycle === 'add' ? 'add' : 'replace', bridgeName = typeof consumer.bridgeName === 'string' ? consumer.bridgeName : null, lifecycleKey = typeof consumer.lifecycleKey === 'string' ? consumer.lifecycleKey : null; return filePath ? { filePath, mode, lifecycle, bridgeName, lifecycleKey } : null; }
function createRendererBridgeMetadataCheck(ipcManifest) { const expected = collectRendererBridgeNamespaces(ipcManifest).map((namespace) => namespace.apiName), actual = [], extra = []; for (const namespace of collectRendererBridgeNamespaces(ipcManifest)) { const metadata = namespace.rendererBridge, bridgeName = typeof metadata?.bridgeName === 'string' ? metadata.bridgeName.trim() : '', consumerFile = typeof metadata?.consumerFile === 'string' ? metadata.consumerFile.trim() : '', lifecycle = metadata?.lifecycle === 'add' || metadata?.lifecycle === 'replace' ? metadata.lifecycle : '', lifecycleKey = typeof metadata?.lifecycleKey === 'string' ? metadata.lifecycleKey.trim() : ''; if (!metadata) { extra.push(`${namespace.apiName}: rendererBridge missing`); continue; } if (!bridgeName) extra.push(`${namespace.apiName}: bridgeName missing`); if (!consumerFile) extra.push(`${namespace.apiName}: consumerFile missing`); if (!lifecycle) extra.push(`${namespace.apiName}: lifecycle missing`); if (lifecycle === 'replace' && !lifecycleKey) extra.push(`${namespace.apiName}: lifecycleKey missing`); if (lifecycle === 'add' && lifecycleKey) extra.push(`${namespace.apiName}: lifecycleKey not allowed for add lifecycle`); if (bridgeName && consumerFile && lifecycle && (lifecycle === 'add' || lifecycleKey)) actual.push(namespace.apiName); } const check = compareSortedValues({ name: 'ipc manifest renderer preload bridge metadata is explicit', expected, actual }); return { ...check, status: check.status === 'pass' && extra.length === 0 ? 'pass' : 'fail', extra: [...check.extra, ...extra] }; }
function createRendererBridgeEventMetadataCheck(ipcManifest, eventManifest) { const rendererEventByValue = new Map((eventManifest.scopes.find((entry) => entry.scope === 'renderer')?.events || []).map((event) => [event.value, event])), subscriptionByApi = new Map(collectRendererBridgeNamespaces(ipcManifest).map((namespace) => [namespace.apiName, new Map((namespace.subscriptions || []).map((entry) => [derivePublicMethodName(entry), entry]))])), entries = collectRendererBridgeNamespaces(ipcManifest).flatMap((namespace) => Object.entries(namespace.rendererBridge?.eventChannels || {}).map(([method, event]) => [namespace.apiName, method, event, rendererBridgeEventValue(event)])), expected = entries.map(([apiName, method, _event, value]) => `${apiName}.${method} ${value}`), actual = entries.filter(([apiName, method, event, value]) => { const rendererEvent = rendererEventByValue.get(value), subscription = subscriptionByApi.get(apiName)?.get(method); return event.scope === 'renderer' && rendererEvent && subscription && (event.payload === 'none' ? subscription.payload === 'void' && rendererEvent.payload === 'void' : event.payload === 'passthrough' && subscription.payload !== 'void' && (rendererEvent.payload === 'unknown' || normalizePayloadType(rendererEvent.payload) === normalizePayloadType(subscription.payload))); }).map(([apiName, method, _event, value]) => `${apiName}.${method} ${value}`); return compareSortedValues({ name: 'ipc manifest renderer preload bridge event metadata resolves to renderer events', expected, actual }); }
function createRendererPreloadBridgeDescriptorPreview(ipcManifest) {
  const namespaces = collectRendererBridgeNamespaces(ipcManifest), replaceNamespaces = namespaces.filter((namespace) => namespace.rendererBridge?.lifecycle === 'replace'), methodUnionRows = namespaces.map((namespace) => `  readonly ${namespace.apiName}: ${(namespace.subscriptions || []).map((entry) => quotedTsString(derivePublicMethodName(entry))).join(' | ') || 'never'};`), lifecycleRows = namespaces.map((namespace) => `  readonly ${namespace.apiName}: ${quotedTsString(namespace.rendererBridge?.lifecycle || 'replace')};`), lifecycleKeyNameRows = replaceNamespaces.map((namespace, index) => `  ${namespace.apiName}: ${quotedTsString(namespace.rendererBridge.lifecycleKey)}${index === replaceNamespaces.length - 1 ? '' : ','}`), lifecycleKeyRows = replaceNamespaces.map((namespace, index) => `  ${namespace.apiName}: Symbol(rendererPreloadBridgeLifecycleKeyNames.${namespace.apiName})${index === replaceNamespaces.length - 1 ? '' : ','}`), methodNameRows = namespaces.map((namespace, index) => `  ${namespace.apiName}: [${(namespace.subscriptions || []).map((entry) => quotedTsString(derivePublicMethodName(entry))).join(', ')}]${index === namespaces.length - 1 ? '' : ','}`), eventRows = namespaces.map((namespace, index) => { const events = Object.entries(namespace.rendererBridge?.eventChannels || {}).map(([method, event]) => `${method}: ${eventChannelAccess(event)}`); return `  ${namespace.apiName}: {${events.length ? ` ${events.join(', ')} ` : ''}}${index === namespaces.length - 1 ? '' : ','}`; }), descriptorRows = namespaces.map((namespace, index) => { const metadata = namespace.rendererBridge || {}, base = `  ${namespace.apiName}: { apiName: ${quotedTsString(namespace.apiName)}, methods: rendererPreloadBridgeMethodNames.${namespace.apiName}, events: rendererPreloadBridgeEventChannels.${namespace.apiName}, bridgeName: ${quotedTsString(metadata.bridgeName || namespace.apiName)}`; return `${base}, lifecycle: ${quotedTsString(metadata.lifecycle || 'replace')}${metadata.lifecycle === 'replace' ? `, lifecycleKey: rendererPreloadBridgeLifecycleKeys.${namespace.apiName}` : ''} }${index === namespaces.length - 1 ? '' : ','}`; });
  return [`// ${rendererPreloadBridgeDescriptorBlockMarker}:START`, 'type RendererPreloadBridgeMethodMap = {', ...methodUnionRows, '};', 'type RendererPreloadBridgeLifecycleMap = {', ...lifecycleRows, '};', "type RendererPreloadBridgeReplaceApiName = { [TApiName in keyof RendererPreloadBridgeLifecycleMap]: RendererPreloadBridgeLifecycleMap[TApiName] extends 'replace' ? TApiName : never }[keyof RendererPreloadBridgeLifecycleMap] & string;", `const rendererPreloadBridgeApiNames = [${namespaces.map((namespace) => quotedTsString(namespace.apiName)).join(', ')}] as const satisfies readonly (keyof RendererPreloadBridgeMethodMap)[];`, 'const rendererPreloadBridgeMethodNames = {', ...methodNameRows, '} as const satisfies { readonly [TApiName in keyof RendererPreloadBridgeMethodMap]: readonly RendererPreloadBridgeMethodMap[TApiName][] };', 'const rendererPreloadBridgeEventChannels = {', ...eventRows, '} as const satisfies { readonly [TApiName in keyof RendererPreloadBridgeMethodMap]: RendererPreloadBridgeEventDescriptorMap<RendererPreloadBridgeMethodMap[TApiName]> };', 'const rendererPreloadBridgeLifecycleKeyNames = {', ...lifecycleKeyNameRows, '} as const satisfies { readonly [TApiName in RendererPreloadBridgeReplaceApiName]: string };', 'const rendererPreloadBridgeLifecycleKeys = {', ...lifecycleKeyRows, '} as const satisfies { readonly [TApiName in RendererPreloadBridgeReplaceApiName]: RendererPreloadBridgeLifecycleKey };', 'export type RendererPreloadBridgeApiName = keyof RendererPreloadBridgeMethodMap & string;', '', 'function assertManifestMethodsMatchDescriptor(apiName: string, manifestMethods: readonly string[], descriptorMethods: readonly string[]): void {', '  const missing = descriptorMethods.filter((method) => !manifestMethods.includes(method));', '  const extra = manifestMethods.filter((method) => !descriptorMethods.includes(method));', '  if (missing.length || extra.length) {', '    throw new Error(`IPC manifest subscriptions for renderer preload bridge API "${apiName}" do not match descriptor: ${[missing.length ? `missing ${missing.join(\', \')}` : \'\', extra.length ? `extra ${extra.join(\', \')}` : \'\'].filter(Boolean).join(\'; \')}`);', '  }', '}', '', 'function assertRendererPreloadBridgeDescriptorManifestParity(', '  manifest: IpcManifest = IpcContractManifest', '): void {', '  for (const apiName of rendererPreloadBridgeApiNames) {', '    const namespace = manifest.namespaces.find((entry) => entry.apiName === apiName);', '    if (!namespace || !hasManifestSubscriptions(namespace)) {', '      throw new Error(`IPC manifest subscriptions not found for renderer preload bridge API "${apiName}"`);', '    }', '    const descriptorMethods = rendererPreloadBridgeMethodNames[apiName];', '    assertManifestMethodsMatchDescriptor(apiName, [...namespace.subscriptions].map(derivePublicMethodName), descriptorMethods);', '  }', '}', '', "function requireManifestRendererBridgeMetadata(apiName: string, namespace: IpcNamespaceManifest): NonNullable<IpcNamespaceManifest['rendererBridge']> {", '  const metadata = namespace.rendererBridge;', "  if (!metadata || typeof metadata.bridgeName !== 'string' || typeof metadata.lifecycle !== 'string') {", '    throw new Error(`IPC manifest renderer bridge metadata missing for "${apiName}"`);', '  }', "  if (metadata.lifecycle === 'replace' && typeof metadata.lifecycleKey !== 'string') {", '    throw new Error(`IPC manifest renderer bridge lifecycleKey missing for "${apiName}"`);', '  }', '  return metadata;', '}', '', 'assertRendererPreloadBridgeDescriptorManifestParity();', '', 'export const RendererPreloadBridgeDescriptors = {', ...descriptorRows, '} as const satisfies RendererPreloadBridgeDescriptorMap<RendererPreloadBridgeMethodMap, RendererPreloadBridgeLifecycleMap>;', '', 'function assertRendererPreloadBridgeMetadataManifestParity(', '  manifest: IpcManifest = IpcContractManifest,', '  descriptors: RendererPreloadBridgeDescriptorMap<RendererPreloadBridgeMethodMap, RendererPreloadBridgeLifecycleMap> = RendererPreloadBridgeDescriptors', '): void {', '  for (const apiName of rendererPreloadBridgeApiNames) {', '    const namespace = manifest.namespaces.find((entry) => entry.apiName === apiName);', '    if (!namespace) {', '      throw new Error(`IPC manifest namespace not found for renderer preload bridge API "${apiName}"`);', '    }', '    const metadata = requireManifestRendererBridgeMetadata(apiName, namespace);', '    const descriptor = descriptors[apiName];', "    const descriptorLifecycleKey = descriptor.lifecycle === 'replace'", '      ? rendererPreloadBridgeLifecycleKeyNames[apiName as RendererPreloadBridgeReplaceApiName]', '      : undefined;', "    const manifestLifecycleKey = metadata.lifecycle === 'replace' ? metadata.lifecycleKey : undefined;", '    if (metadata.bridgeName !== descriptor.bridgeName || metadata.lifecycle !== descriptor.lifecycle || manifestLifecycleKey !== descriptorLifecycleKey) {', '      throw new Error(`IPC manifest renderer bridge metadata for "${apiName}" does not match generated descriptor`);', '    }', '  }', '}', '', 'assertRendererPreloadBridgeMetadataManifestParity();', `// ${rendererPreloadBridgeDescriptorBlockMarker}:END`].join('\n');
}
const findTopLevelVariableStatement = (sourceFile, variableName, exported = false) => { const matches = sourceFile.statements.filter((node) => ts.isVariableStatement(node) && (!exported || node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) && node.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === variableName)); return matches.length === 1 ? matches[0] : null; };
function extractMarkedVariableBlock(sourceText, filePath, variableName, markerName, exported = false) { const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true), statement = findTopLevelVariableStatement(sourceFile, variableName, exported), startMarker = `// ${markerName}:START`, endMarker = `// ${markerName}:END`; if (!statement) return null; const startIndex = sourceText.lastIndexOf(startMarker, statement.getStart(sourceFile)), endIndex = sourceText.indexOf(endMarker, statement.end); return startIndex !== -1 && endIndex !== -1 ? sourceText.slice(startIndex, endIndex + endMarker.length).trimEnd() : null; }
function extractRendererPreloadBridgeDescriptorBlock(sourceText) { return extractMarkedVariableBlock(sourceText, 'src/renderer/infrastructure/services/preload-event-bridge.factory.ts', 'RendererPreloadBridgeDescriptors', rendererPreloadBridgeDescriptorBlockMarker, true); }
function resolveRendererManifestBridgeConsumers(ipcManifest, options = {}) { const consumers = new Map(collectRendererBridgeNamespaces(ipcManifest).flatMap((namespace) => { const consumer = normalizeRendererManifestBridgeConsumerEntry(namespace.rendererBridge); return consumer ? [[namespace.apiName, consumer]] : []; })), configuredConsumers = options.rendererBridgeConsumers && typeof options.rendererBridgeConsumers === 'object' ? options.rendererBridgeConsumers : {}; for (const [apiName, consumer] of Object.entries(configuredConsumers)) { if (consumer === null) { consumers.delete(apiName); continue; } const normalized = normalizeRendererManifestBridgeConsumerEntry(consumer); if (normalized) consumers.set(apiName, normalized); } return consumers; }
const memberAccessName = (node) => ts.isPropertyAccessExpression(node) ? node.name.text : ts.isElementAccessExpression(node) ? staticStringValue(node.argumentExpression) : null;
const memberAccessTarget = (node) => ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) ? node.expression : null;
const isCallNamed = (node, name) => ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name, isManifestBridgeCall = (node) => isCallNamed(node, 'createRendererPreloadEventBridge');
const isThisDisposablesLifecycleCall = (node, methodName) => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === methodName && ts.isPropertyAccessExpression(node.expression.expression) && node.expression.expression.name.text === 'disposables' && node.expression.expression.expression.kind === ts.SyntaxKind.ThisKeyword;
const hasManifestBridgeAsManagedReplacement = (node) => isThisDisposablesLifecycleCall(node, 'replace') && isCallNamed(unwrappedExpression(node.arguments[1]), 'createRendererPreloadEventBridge'), hasManifestBridgeAsManagedAdd = (node) => isThisDisposablesLifecycleCall(node, 'add') && isCallNamed(unwrappedExpression(node.arguments[0]), 'createRendererPreloadEventBridge');
const isLiveEventBridgeAssignment = (node, consumer) => ts.isCallExpression(node.parent) && (hasManifestBridgeAsManagedReplacement(node.parent) && node.parent.arguments[1] === node || consumer.lifecycle === 'add' && hasManifestBridgeAsManagedAdd(node.parent) && node.parent.arguments[0] === node);
const isTrackedPreloadApiExpression = (node, apiName, sourceFile) => { const value = unwrappedExpression(node), target = value && memberAccessTarget(value); return Boolean(value && memberAccessName(value) === apiName && ['window', 'globalThis'].includes(target?.getText(sourceFile))); };
const memberNameRange = (node) => ts.isPropertyAccessExpression(node) ? [node.name.pos, node.name.end] : ts.isElementAccessExpression(node) && node.argumentExpression ? [node.argumentExpression.pos, node.argumentExpression.end] : null;
const rendererDescriptorEventMethod = (node, apiName) => { const methodName = memberAccessName(node), eventsAccess = memberAccessTarget(node), apiAccess = eventsAccess && memberAccessTarget(eventsAccess), root = apiAccess && memberAccessTarget(apiAccess); return methodName && memberAccessName(eventsAccess) === 'events' && memberAccessName(apiAccess) === apiName && ts.isIdentifier(root) && root.text === 'RendererPreloadBridgeDescriptors' ? methodName : null; };
const isExpectedGlobalApiExpression = (node, apiName, sourceFile, globalsShadowed = false) => !globalsShadowed && isTrackedPreloadApiExpression(node, apiName, sourceFile);
const allowedManifestBridgeOptionKeys = new Set(['api', 'descriptor', 'logger', 'handlers']), allowedTrackedApiArgumentCalls = new Set(['Boolean']);
function collectMappedEventChannelReferences(sourceFile, mappedEventAccesses) {
  const objectAliases = new Map(), valueAliases = new Map(), rootAliases = new Set(['EventChannels']), found = new Set(), propName = (node) => ts.isIdentifier(node) || ts.isStringLiteralLike(node) ? node.text : null, pathFor = (node) => { const value = unwrappedExpression(node); if (!value) return null; if (ts.isIdentifier(value)) return valueAliases.get(value.text) || objectAliases.get(value.text) || (rootAliases.has(value.text) ? 'EventChannels' : null); if (ts.isPropertyAccessExpression(value) || ts.isElementAccessExpression(value)) { const target = pathFor(value.expression), member = memberAccessName(value); return target && member ? `${target}.${member}` : null; } return null; }, addAlias = (local, sourcePath) => { if (!local || !sourcePath) return; if (mappedEventAccesses.has(sourcePath)) { valueAliases.set(local, sourcePath); found.add(sourcePath); } else objectAliases.set(local, sourcePath); };
  const visit = (node) => { const resolvedPath = pathFor(node); if (mappedEventAccesses.has(resolvedPath)) found.add(resolvedPath); if (ts.isImportDeclaration(node) && String(node.moduleSpecifier.getText(sourceFile)).includes('event-channels') && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) for (const element of node.importClause.namedBindings.elements) if ((element.propertyName || element.name).text === 'EventChannels') rootAliases.add(element.name.text); if (ts.isVariableDeclaration(node)) { const sourcePath = pathFor(node.initializer); if (ts.isIdentifier(node.name)) addAlias(node.name.text, sourcePath); if (ts.isObjectBindingPattern(node.name) && sourcePath) for (const element of node.name.elements) addAlias(ts.isIdentifier(element.name) ? element.name.text : null, `${sourcePath}.${propName(element.propertyName || element.name)}`); } ts.forEachChild(node, visit); };
  visit(sourceFile); return [...found];
}
const isDirectTrackedPreloadInvokeCall = (node, expectedApiName, sourceFile, globalsShadowed, subscriptionMethods) => { if (!ts.isCallExpression(node)) return false; const methodName = memberAccessName(node.expression), receiver = memberAccessTarget(node.expression); return Boolean(methodName && !subscriptionMethods.has(methodName) && receiver && isExpectedGlobalApiExpression(receiver, expectedApiName, sourceFile, globalsShadowed)); };
const isTrackedPreloadApiRoute = (node, trackedApiValues) => { const receiver = ts.isCallExpression(node) ? memberAccessTarget(node.expression) : null, args = node.arguments || [], containsTrackedApiValue = (argument) => { const value = unwrappedExpression(argument); return Boolean(value && (trackedApiValues.contains(value) || trackedApiValues.containsContainer(value) || ts.isSpreadElement(value) && containsTrackedApiValue(value.expression) || ts.isConditionalExpression(value) && (containsTrackedApiValue(value.whenTrue) || containsTrackedApiValue(value.whenFalse)) || ts.isBinaryExpression(value) && (containsTrackedApiValue(value.left) || containsTrackedApiValue(value.right)) || (ts.isCallExpression(value) || ts.isNewExpression(value)) && [...(value.arguments || [])].some(containsTrackedApiValue) || ts.isObjectLiteralExpression(value) && value.properties.some((property) => ts.isPropertyAssignment(property) && containsTrackedApiValue(property.initializer) || ts.isSpreadAssignment(property) && containsTrackedApiValue(property.expression)) || ts.isArrayLiteralExpression(value) && value.elements.some(containsTrackedApiValue))); }; return Boolean(receiver && trackedApiValues.containsContainer(receiver) || args.some(containsTrackedApiValue)); };
function collectTrackedPreloadApiValueAliases(sourceFile, expectedApiName) {
  const aliases = new Set(), containers = new Set(), getters = new Set(), classGetters = new Set(), mark = (set, name) => { if (!set.has(name)) { set.add(name); return true; } return false; }, bindingNames = (name) => ts.isIdentifier(name) ? [name.text] : ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name) ? name.elements.flatMap((element) => element.name ? bindingNames(element.name) : []) : ts.isObjectLiteralExpression(name) ? name.properties.flatMap((property) => ts.isShorthandPropertyAssignment(property) ? [property.name.text] : ts.isPropertyAssignment(property) ? bindingNames(property.initializer) : ts.isSpreadAssignment(property) ? bindingNames(property.expression) : []) : ts.isArrayLiteralExpression(name) ? name.elements.flatMap(bindingNames) : ts.isSpreadElement(name) ? bindingNames(name.expression) : [];
  const valueKey = (node) => { const value = unwrappedExpression(node); if (!value) return null; if (ts.isIdentifier(value)) return value.text; if (ts.isPropertyAccessExpression(value)) { const target = valueKey(value.expression); return target ? `${target}.${value.name.text}` : value.getText(sourceFile); } if (ts.isElementAccessExpression(value) && ts.isStringLiteralLike(value.argumentExpression)) { const target = valueKey(value.expression); return target ? `${target}.${value.argumentExpression.text}` : value.getText(sourceFile); } return null; }, bindingKeys = (name) => { const key = valueKey(name); return [...bindingNames(name), ...(key ? [key] : [])]; }, functionReturns = (node) => { const body = node?.body; return Boolean(body && (ts.isBlock(body) ? body.statements.some((statement) => ts.isReturnStatement(statement) && contains(statement.expression)) : contains(body))); }, containerTargets = (left, rightContainer) => rightContainer ? bindingKeys(left) : ts.isPropertyAccessExpression(left) || ts.isElementAccessExpression(left) ? bindingKeys(left.expression) : [], hasGetterPrefix = (source) => { const key = valueKey(source); return Boolean(key && [...getters].some((getter) => getter.startsWith(`${key}.`))); }, copyGetters = (target, source) => { const key = valueKey(source); return Boolean(key && bindingKeys(target).flatMap((targetKey) => [...getters].filter((getter) => getter.startsWith(`${key}.`)).map((getter) => mark(getters, `${targetKey}.${getter.slice(key.length + 1)}`))).some(Boolean)); }, classGetterCall = (call) => { const expression = unwrappedExpression(call.expression), receiver = expression && ts.isPropertyAccessExpression(expression) ? unwrappedExpression(expression.expression) : null; return Boolean(expression && ts.isPropertyAccessExpression(expression) && receiver && ts.isNewExpression(receiver) && ts.isIdentifier(receiver.expression) && classGetters.has(`${receiver.expression.text}.${expression.name.text}`)); }, markObjectGetters = (target, source) => { const object = unwrappedExpression(source), bases = bindingKeys(target); return Boolean(object && ts.isObjectLiteralExpression(object) && bases.flatMap((base) => object.properties.map((property) => [base, property])).some(([base, property]) => { const name = property.name && propertyName(property.name, sourceFile), returns = ts.isPropertyAssignment(property) && functionReturns(property.initializer) || (ts.isMethodDeclaration(property) || ts.isGetAccessorDeclaration(property)) && functionReturns(property); return Boolean(name && returns && mark(ts.isGetAccessorDeclaration(property) ? aliases : getters, `${base}.${name}`)); })); };
  const providerOpaque = (node) => { const value = unwrappedExpression(node); return Boolean(value && (ts.isCallExpression(value) || ts.isNewExpression(value) || ts.isPropertyAccessExpression(value) || ts.isElementAccessExpression(value) || ts.isSpreadElement(value) && providerOpaque(value.expression) || ts.isConditionalExpression(value) && (providerOpaque(value.whenTrue) || providerOpaque(value.whenFalse)) || ts.isBinaryExpression(value) && (providerOpaque(value.left) || providerOpaque(value.right)) || ts.isObjectLiteralExpression(value) && value.properties.some((property) => ts.isPropertyAssignment(property) && providerOpaque(property.initializer) || ts.isSpreadAssignment(property) && providerOpaque(property.expression)) || ts.isArrayLiteralExpression(value) && value.elements.some(providerOpaque))); };
  const opaqueAssignment = (target, source) => { const value = unwrappedExpression(source); return Boolean(providerOpaque(value) && (bindingKeys(target).some((name) => /api|args|deps/i.test(name)) || value && (ts.isObjectLiteralExpression(value) || ts.isArrayLiteralExpression(value)))); };
  const containsContainer = (node) => { const value = unwrappedExpression(node), key = valueKey(value); return Boolean(value && (key && containers.has(key) || ts.isSpreadElement(value) && containsContainer(value.expression) || (ts.isPropertyAccessExpression(value) || ts.isElementAccessExpression(value)) && containsContainer(value.expression) || ts.isObjectLiteralExpression(value) && value.properties.some((property) => ts.isPropertyAssignment(property) && contains(property.initializer) || ts.isShorthandPropertyAssignment(property) && aliases.has(property.name.text) || ts.isSpreadAssignment(property) && contains(property.expression)) || ts.isArrayLiteralExpression(value) && value.elements.some(contains))); };
  const contains = (node) => { const value = unwrappedExpression(node), key = valueKey(value); return Boolean(value && (isTrackedPreloadApiExpression(value, expectedApiName, sourceFile) || key && aliases.has(key) || ts.isSpreadElement(value) && contains(value.expression) || (ts.isPropertyAccessExpression(value) || ts.isElementAccessExpression(value)) && contains(value.expression) || ts.isConditionalExpression(value) && (contains(value.whenTrue) || contains(value.whenFalse)) || ts.isBinaryExpression(value) && (contains(value.left) || contains(value.right)) || ts.isCallExpression(value) && (getters.has(valueKey(value.expression)) || classGetterCall(value)) || containsContainer(value))); };
  let grew = true; while (grew) { grew = false; const visit = (node) => { if (ts.isVariableDeclaration(node) && (functionReturns(node.initializer) || getters.has(valueKey(node.initializer)))) grew = bindingKeys(node.name).some((name) => mark(getters, name)) || grew; if (ts.isVariableDeclaration(node) && (markObjectGetters(node.name, node.initializer) || copyGetters(node.name, node.initializer) || hasGetterPrefix(node.initializer) && bindingNames(node.name).some((name) => mark(getters, name)))) grew = true; if (ts.isFunctionDeclaration(node) && node.name && functionReturns(node)) grew = mark(getters, node.name.text) || grew; if (ts.isClassDeclaration(node) && node.name) for (const member of node.members) { const name = member.name && propertyName(member.name, sourceFile); if (name && (ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member)) && functionReturns(member)) grew = mark(classGetters, `${node.name.text}.${name}`) || grew; } if (ts.isVariableDeclaration(node) && (contains(node.initializer) || opaqueAssignment(node.name, node.initializer))) grew = bindingNames(node.name).some((name) => mark(aliases, name)) || grew; if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && containsContainer(node.initializer)) grew = mark(containers, node.name.text) || grew; if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && (markObjectGetters(node.left, node.right) || copyGetters(node.left, node.right) || functionReturns(node.right) && valueKey(node.left) && mark(getters, valueKey(node.left)) || hasGetterPrefix(node.right) && bindingNames(node.left).some((name) => mark(getters, name)))) grew = true; if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && (contains(node.right) || opaqueAssignment(node.left, node.right))) grew = bindingKeys(node.left).some((name) => mark(aliases, name)) || containerTargets(node.left, containsContainer(node.right)).some((name) => mark(containers, name)) || grew; ts.forEachChild(node, visit); }; visit(sourceFile); }
  return { contains, containsContainer };
}
function collectRendererSubscriptionReferenceEntries(sourceFile, expectedApiName, subscriptionMethods, allowedRanges, trackedApiValues) {
  const subscriptionReferences = new Set(), directSubscriptionCalls = new Set(), computedPropertyEntries = new Set();
  const globalsShadowed = hasLocalBinding(sourceFile, new Set(['window', 'globalThis']));
  const isAllowed = (node) => Boolean(node && allowedRanges.some(([start, end]) => node.pos >= start && node.end <= end));
  const addSubscriptionReference = (value, node) => { if (value && subscriptionMethods.has(value) && !isAllowed(node)) subscriptionReferences.add(`${expectedApiName}.${value}`); };
  const visit = (node) => {
    const value = ts.isIdentifier(node) || ts.isStringLiteralLike(node) ? node.text : null;
    addSubscriptionReference(value, node);
    if (ts.isCallExpression(node)) { const methodName = memberAccessName(node.expression), receiver = memberAccessTarget(node.expression); if (!globalsShadowed && methodName && subscriptionMethods.has(methodName) && receiver && isTrackedPreloadApiExpression(receiver, expectedApiName, sourceFile) && !isAllowed(node.expression)) directSubscriptionCalls.add(`${expectedApiName}.${methodName}`); }
    if (ts.isElementAccessExpression(node)) { const resolvedName = staticStringValue(node.argumentExpression); if (resolvedName) addSubscriptionReference(resolvedName, node.argumentExpression || node); else if (trackedApiValues.contains(node.expression) && !isAllowed(node)) computedPropertyEntries.add(`${expectedApiName}.computedProperty`); }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { subscriptionReferences: [...subscriptionReferences], directSubscriptionCalls: [...directSubscriptionCalls], computedPropertyEntries: [...computedPropertyEntries] };
}
function collectRendererManifestBridgeEntries(ipcManifest, options = {}) {
  const consumers = resolveRendererManifestBridgeConsumers(ipcManifest, options), actual = [], extra = [], expected = [], overrides = options.rendererBridgeSourceOverrides || {}, totalManifestSubscriptionCount = ipcManifest.namespaces.reduce((count, namespace) => count + (namespace.subscriptions || []).length, 0);
  for (const [expectedApiName, consumer] of consumers.entries()) {
    const namespace = ipcManifest.namespaces.find((entry) => entry.apiName === expectedApiName) || {}, subscriptions = namespace.subscriptions || [], filePath = consumer.filePath;
    expected.push(...subscriptions.map((entry) => `${expectedApiName}.${derivePublicMethodName(entry)}`)); const sourceText = Object.prototype.hasOwnProperty.call(overrides, filePath) ? String(overrides[filePath] ?? '') : readProjectText(filePath), sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
    if (sourceFile.parseDiagnostics.length > 0) { extra.push(`${filePath}: parseDiagnostics`); continue; }
    const bridgeEventEntries = Object.entries(namespace.rendererBridge?.eventChannels || {}), bridgeEventMethods = new Set(bridgeEventEntries.map(([method]) => method)), descriptorEventReferences = new Set();
    const allowedSubscriptionNameRanges = [], subscriptionMethods = new Set(subscriptions.map((entry) => derivePublicMethodName(entry))), globalsShadowed = hasLocalBinding(sourceFile, new Set(['window', 'globalThis'])), bridgeBindingsShadowed = hasNonImportBinding(sourceFile, new Set(['RendererPreloadBridgeDescriptors', 'createRendererPreloadEventBridge'])), trackedApiValues = globalsShadowed ? { contains: () => false, containsContainer: () => false } : collectTrackedPreloadApiValueAliases(sourceFile, expectedApiName);
    let liveBridgeAssignmentDetected = false;
    if (sourceText.includes('createPreloadEventBridge')) extra.push(`${filePath}: createPreloadEventBridge`);
    if (sourceText.includes('createManifestPreloadEventBridge')) extra.push(`${filePath}: createManifestPreloadEventBridge`);
    if (/\bconst\s+[A-Z0-9_]*PRELOAD_BRIDGE_LIFECYCLE\s*=\s*Symbol\(/.test(sourceText)) extra.push(`${filePath}: local preload bridge lifecycle symbol`);
    for (const directEventAccess of collectMappedEventChannelReferences(sourceFile, new Set(bridgeEventEntries.map(([_method, event]) => eventChannelAccess(event))))) extra.push(`${filePath}: direct ${directEventAccess}`);
    if (bridgeBindingsShadowed) extra.push(`${filePath}: bridge binding shadowed`);
    const visit = (node) => {
      const descriptorEventMethod = bridgeBindingsShadowed ? null : rendererDescriptorEventMethod(node, expectedApiName);
      if (descriptorEventMethod && bridgeEventMethods.has(descriptorEventMethod)) { descriptorEventReferences.add(descriptorEventMethod); const range = memberNameRange(node); if (range) allowedSubscriptionNameRanges.push(range); }
      if (isManifestBridgeCall(node) && isLiveEventBridgeAssignment(node, consumer)) { const optionsArg = unwrappedExpression(node.arguments[0]); if (optionsArg && ts.isObjectLiteralExpression(optionsArg)) {
        liveBridgeAssignmentDetected = true;
        if (consumer.lifecycle === 'replace') { const lifecycleArgument = unwrappedExpression(node.parent.arguments[0]); if (!lifecycleArgument || lifecycleArgument.getText(sourceFile) !== `RendererPreloadBridgeDescriptors.${expectedApiName}.lifecycleKey`) extra.push(`${filePath}: lifecycleKey ${lifecycleArgument?.getText(sourceFile) || 'missing'}`); }
        let apiName = null, apiExpression = null, apiMatchesExpected = false, handlers = null; for (const property of optionsArg.properties) { if (ts.isSpreadAssignment(property)) { extra.push(`${filePath}: options spread`); continue; } if (ts.isPropertyAssignment(property)) { const { name: key, unresolvedComputed } = resolvedPropertyName(property.name, sourceFile), value = unwrappedExpression(property.initializer); if (unresolvedComputed) { extra.push(`${filePath}: option computedProperty`); continue; } if (!allowedManifestBridgeOptionKeys.has(key)) extra.push(`${filePath}: option ${key || 'unknown'}`); if (key === 'descriptor') apiName = !bridgeBindingsShadowed && value?.getText(sourceFile) === `RendererPreloadBridgeDescriptors.${expectedApiName}` ? expectedApiName : value?.getText(sourceFile); if (key === 'api') { apiExpression = value?.getText(sourceFile); apiMatchesExpected = isExpectedGlobalApiExpression(value, expectedApiName, sourceFile, globalsShadowed) || trackedApiValues.contains(value); } if (key === 'handlers') handlers = value; } else extra.push(`${filePath}: option ${property.getText(sourceFile)}`); }
        if (apiName !== expectedApiName) extra.push(`${filePath}: apiName ${apiName || 'missing'}`);
        if (!apiMatchesExpected) extra.push(`${filePath}: api ${apiExpression || 'missing'}`);
        if (apiName && handlers && ts.isObjectLiteralExpression(handlers)) for (const property of handlers.properties) { if (ts.isSpreadAssignment(property)) extra.push(`${filePath}: handler spread`); else if (property.name) { allowedSubscriptionNameRanges.push([property.name.pos, property.name.end]); const { name: handlerName, unresolvedComputed } = resolvedPropertyName(property.name, sourceFile); if (unresolvedComputed) extra.push(`${filePath}: handler computedProperty`); else if (handlerName) actual.push(`${apiName}.${handlerName}`); } }
      } }
      if (consumer.mode === 'bridge' && (ts.isCallExpression(node) || ts.isNewExpression(node)) && !(ts.isCallExpression(node) && (isManifestBridgeCall(node) || hasManifestBridgeAsManagedReplacement(node) || consumer.lifecycle === 'add' && hasManifestBridgeAsManagedAdd(node) || ts.isIdentifier(node.expression) && allowedTrackedApiArgumentCalls.has(node.expression.text) || isDirectTrackedPreloadInvokeCall(node, expectedApiName, sourceFile, globalsShadowed, subscriptionMethods))) && isTrackedPreloadApiRoute(node, trackedApiValues)) extra.push(`${filePath}: ${expectedApiName} helper argument`);
      ts.forEachChild(node, visit); };
    visit(sourceFile);
    for (const [method] of bridgeEventEntries) if (!descriptorEventReferences.has(method)) extra.push(`${filePath}: missing RendererPreloadBridgeDescriptors.${expectedApiName}.events.${method}`);
    const { subscriptionReferences, directSubscriptionCalls, computedPropertyEntries } = collectRendererSubscriptionReferenceEntries(sourceFile, expectedApiName, subscriptionMethods, allowedSubscriptionNameRanges, trackedApiValues);
    if (consumer.mode === 'direct' && !liveBridgeAssignmentDetected) actual.push(...directSubscriptionCalls); else extra.push(...subscriptionReferences.map((entry) => `${filePath}: ${entry}`));
    extra.push(...computedPropertyEntries.map((entry) => `${filePath}: ${entry}`));
  } return { expected, actual, extra, totalManifestSubscriptionCount };
}
function createRendererManifestBridgeUsageCheck(ipcManifest, options = {}) {
  const { expected, actual, extra, totalManifestSubscriptionCount } = collectRendererManifestBridgeEntries(ipcManifest, options), check = compareSortedValues({ name: 'renderer preload bridge wiring derives subscriptions from ipc manifest', expected, actual });
  const expectedCountMatchesManifest = check.expectedCount === totalManifestSubscriptionCount;
  const coverageFailures = expectedCountMatchesManifest ? [] : [`renderer subscription coverage mismatch expected=${check.expectedCount} manifest=${totalManifestSubscriptionCount}`];
  return { ...check, status: check.status === 'pass' && coverageFailures.length === 0 && extra.length === 0 ? 'pass' : 'fail', extra: [...check.extra, ...coverageFailures, ...extra] };
}
function createGeneratedBlockCheck({ name, sourceText, markerName, expectedBlock }) { const actualBlock = extractMarkedBlock(sourceText, markerName), expected = expectedBlock.trimEnd(), pass = actualBlock === expected; return { name, status: pass ? 'pass' : 'fail', expected, actual: actualBlock ?? 'missing', missing: actualBlock ? [] : [`${markerName}:START`], extra: actualBlock && !pass ? ['generated block drift'] : [] }; }
function createExactBlockCheck({ name, actualBlock, markerName, expectedBlock }) { const expected = expectedBlock.trimEnd(), actual = actualBlock?.trimEnd() ?? null, pass = actual === expected; return { name, status: pass ? 'pass' : 'fail', expected, actual: actual ?? 'missing', missing: actual ? [] : [`${markerName}:START`], extra: actual && !pass ? ['generated block drift'] : [] }; }
function createExactSourceCheck({ name, sourceText, expectedText }) {
  const expected = expectedText.trimEnd(), actual = sourceText.trimEnd(), pass = actual === expected;
  return { name, status: pass ? 'pass' : 'fail', expected, actual, missing: pass ? [] : ['generated source parity'], extra: pass ? [] : ['checked-in source drift'] };
}
function createModeCheck(name, mode) { const pass = mode === 'enforced'; return { name, status: pass ? 'pass' : 'fail', expected: 'enforced', actual: mode, missing: pass ? [] : ['mode=enforced'], extra: [] }; }
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
const manifestBackedHandlerForbiddenMetadataKeys = new Set(['channel', 'argumentSchema', 'dependencyTokens', 'responseMode']);
function collectManifestBackedHandlerDescriptors(options = {}) {
  const methodIdentities = [], localMetadataEntries = [];
  for (const { filePath = 'src/main/ipc/handlers/unknown.handler.ts', sourceText = '' } of resolveManifestBackedHandlerSources(options)) {
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true); if (sourceFile.parseDiagnostics.length > 0) { localMetadataEntries.push(`${filePath}.parseDiagnostics`); continue; }
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'defineManifestIpcHandlers') {
        const [apiNameArgument, descriptorsArgument] = node.arguments;
        if (!ts.isStringLiteralLike(apiNameArgument)) return; const apiName = apiNameArgument.text, descriptors = unwrappedExpression(descriptorsArgument);
        if (!descriptors || !ts.isArrayLiteralExpression(descriptors)) return;
        for (const descriptorExpression of descriptors.elements) { if (ts.isSpreadElement(descriptorExpression)) { localMetadataEntries.push(`${apiName}.unknown.descriptorSpread`); continue; }
          const descriptorObject = unwrappedExpression(descriptorExpression); if (!descriptorObject || !ts.isObjectLiteralExpression(descriptorObject)) continue;
          let methodName = null;
          for (const property of descriptorObject.properties) if (ts.isPropertyAssignment(property) && resolvedPropertyName(property.name, sourceFile).name === 'method') {
            const methodValue = unwrappedExpression(property.initializer);
            if (methodValue && ts.isStringLiteralLike(methodValue)) methodName = methodValue.text;
          }
          for (const property of descriptorObject.properties) {
            if (ts.isSpreadAssignment(property)) { localMetadataEntries.push(`${apiName}.${methodName || 'unknown'}.spread`); continue; }
            if (!property.name) continue;
            const { name: propertyKey, unresolvedComputed } = resolvedPropertyName(property.name, sourceFile);
            if (unresolvedComputed) {
              localMetadataEntries.push(`${apiName}.${methodName || 'unknown'}.computedPropertyName`);
              continue;
            }
            if (propertyKey && manifestBackedHandlerForbiddenMetadataKeys.has(propertyKey)) localMetadataEntries.push(`${apiName}.${methodName || 'unknown'}.${propertyKey}`);
          }
          if (methodName) methodIdentities.push(`${apiName}.${methodName}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return { methodIdentities, localMetadataEntries };
}
function buildPhase1DriftReport(manifests = loadManifests(), options = {}) {
  const checks = [];
  const ipcChannels = collectIpcManifestChannelMap(manifests.ipc);
  const currentChannels = Object.values(ipcChannels).flatMap((namespace) => Object.values(namespace));
  const ipcManifestSource = options.ipcManifestSource || readProjectText('src/shared/ipc/ipc.manifest.ts');
  const ipcExposureIdentities = manifests.ipc.namespaces.flatMap((namespace) => [namespace.apiName, ...(namespace.exposedMethods || []).map((method) => `${namespace.apiName}.${method}`)]);
  const ipcExposedMethodIdentities = manifests.ipc.namespaces.flatMap((namespace) => (namespace.exposedMethods || []).map((method) => `${namespace.apiName}.${method}`));
  checks.push(compareSortedValues({ name: 'ipc manifest preload exposure entries are unique', expected: [...new Set(ipcExposureIdentities)], actual: ipcExposureIdentities }));
  checks.push(compareSortedValues({ name: 'ipc manifest exposed methods are owned by exactly one invoke or subscription entry', expected: ipcExposedMethodIdentities, actual: collectIpcManifestOwnedMethodIdentities(manifests.ipc) }));
  checks.push(createSubscriptionRegistryMetadataCheck(manifests.ipc));
  checks.push(compareSortedValues({ name: 'ipc runtime channels derive from ipc manifest', expected: currentChannels, actual: collectIpcManifestChannels(manifests.ipc) }));
  checks.push(createGeneratedBlockCheck({ name: 'ipc channel type map matches ipc manifest', sourceText: ipcManifestSource, markerName: ipcChannelMapBlockMarker, expectedBlock: createIpcChannelMapBlock(manifests.ipc) }));
  checks.push(compareSortedValues({ name: 'ipc manifest channel keys resolve to declared channels',
    expected: collectIpcManifestChannelKeyEntries(manifests.ipc, (_namespace, entry) => entry.channel),
    actual: collectIpcManifestChannelKeyEntries(manifests.ipc, (namespace, entry) => resolveIpcChannelFromKey(ipcChannels, namespace.namespace, entry.channelKey)) }));
  checks.push(compareSortedValues({ name: 'ipc manifest handler metadata is explicit', expected: collectIpcManifestHandlerMetadataEntries(manifests.ipc), actual: collectIpcManifestHandlerMetadataEntries(manifests.ipc, true) }));
  const handlerDescriptors = collectManifestBackedHandlerDescriptors(options);
  checks.push(compareSortedValues({ name: 'main IPC handlers derive descriptor metadata from manifest', expected: manifests.ipc.namespaces.flatMap((namespace) => (namespace.invoke || []).map((entry) => `${namespace.apiName}.${derivePublicMethodName(entry)}`)), actual: handlerDescriptors.methodIdentities }));
  checks.push(compareSortedValues({ name: 'main IPC handlers do not define local descriptor metadata', expected: [], actual: handlerDescriptors.localMetadataEntries }));
  checks.push(createRendererBridgeMetadataCheck(manifests.ipc));
  checks.push(createRendererBridgeEventMetadataCheck(manifests.ipc, manifests.events));
  const rendererPreloadBridgeDescriptorsSource = options.rendererPreloadBridgeDescriptorsSource || readProjectText('src/renderer/infrastructure/services/preload-event-bridge.factory.ts');
  const generatedRendererPreloadBridgeDescriptors = createRendererPreloadBridgeDescriptorPreview(manifests.ipc);
  checks.push(createExactBlockCheck({ name: 'renderer preload bridge descriptors match ipc manifest', actualBlock: extractRendererPreloadBridgeDescriptorBlock(rendererPreloadBridgeDescriptorsSource), markerName: rendererPreloadBridgeDescriptorBlockMarker, expectedBlock: generatedRendererPreloadBridgeDescriptors }));
  checks.push(createRendererManifestBridgeUsageCheck(manifests.ipc, options));
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
  const preloadValidatorsSource = options.preloadValidatorsSource || readProjectText('src/preload/validators.ts');
  checks.push(createExactBlockCheck({ name: 'preload method contract descriptors match ipc manifest', actualBlock: extractMarkedVariableBlock(options.preloadSubscriptionFactorySource || readProjectText('src/preload/subscription.factory.ts'), 'src/preload/subscription.factory.ts', 'preloadApiNames', preloadMethodContractBlockMarker), markerName: preloadMethodContractBlockMarker, expectedBlock: createPreloadMethodContractBlock(manifests.ipc) }), createPreloadPayloadValidatorMetadataCheck(manifests.ipc), createExactBlockCheck({ name: 'preload payload validator registry matches ipc manifest subscriptions', actualBlock: extractMarkedVariableBlock(preloadValidatorsSource, 'src/preload/validators.ts', 'preloadPayloadValidators', preloadPayloadValidatorBlockMarker), markerName: preloadPayloadValidatorBlockMarker, expectedBlock: createPreloadPayloadValidatorBlock(manifests.ipc) }), createExactBlockCheck({ name: 'preload invoke argument validator expectations match ipc manifest', actualBlock: extractMarkedVariableBlock(preloadValidatorsSource, 'src/preload/validators.ts', 'preloadInvokeArgumentValidatorNamesByMethod', preloadInvokeArgumentValidatorBlockMarker), markerName: preloadInvokeArgumentValidatorBlockMarker, expectedBlock: createPreloadInvokeArgumentValidatorBlock(manifests.ipc) }));
  const preloadIndexSource = readProjectText('src/preload/index.ts');
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
  const eventChannelsSource = options.eventChannelsSource || readProjectText('src/shared/events/event-channels.ts');
  const eventPayloadsSource = options.eventPayloadsSource || readProjectText('src/shared/events/event-payloads.ts');
  const generatedEventChannels = createEventChannelsPreview(manifests.events), generatedEventPayloadMap = createEventPayloadMapBlock(manifests.events);
  checks.push(compareSortedValues({ name: 'renderer event manifest matches EventChannels values', expected: collectEventManifestChannelPathValueEntries(manifests.events, 'renderer'), actual: collectRendererEventChannelPathValueEntries(eventChannelsSource) }));
  checks.push(createExactSourceCheck({
    name: 'renderer event channels generated preview matches checked-in source',
    sourceText: eventChannelsSource,
    expectedText: generatedEventChannels
  }));
  checks.push(createModeCheck('event manifest is enforced', manifests.events.mode));
  checks.push(createExactSourceCheck({
    name: 'renderer EventPayloadMap derives from generated payload aliases',
    sourceText: getTypeAliasText(eventPayloadsSource, 'EventPayloadMap', 'source.ts', true),
    expectedText: compactEventPayloadMapType
  }));
  checks.push(createExactSourceCheck({
    name: 'renderer event payload aliases are active generated declarations',
    sourceText: collectEventPayloadAliasBlock(eventPayloadsSource),
    expectedText: stripGeneratedPayloadMarkers(generatedEventPayloadMap)
  }));
  checks.push(createGeneratedBlockCheck({
    name: 'renderer event manifest payloads match EventPayloadMap',
    sourceText: extractEventPayloadGeneratedBlock(eventPayloadsSource) || '',
    markerName: eventPayloadBlockMarker,
    expectedBlock: generatedEventPayloadMap
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
    sourceText: readProjectText('src/shared/features/devices/device.registry.ts'),
    requiredFragments: [
      'DeviceManifest.devices.map',
      'device.modules.profile',
      'device.modules.adapter',
      '[...device.labelPatterns]'
    ]
  }));
  checks.push(createDerivedSourceCheck({
    name: 'Chromatic runtime config derives hardware metadata from device manifest',
    sourceText: readProjectText('src/shared/features/devices/profiles/chromatic/device-chromatic.config.ts'),
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
  checks.push(...createTemplateDomParityChecks(manifests, options));
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
      rendererPreloadBridgeDescriptors: generatedRendererPreloadBridgeDescriptors,
      eventChannels: generatedEventChannels,
      eventPayloadMap: generatedEventPayloadMap,
      docsFragment: createDocsFragment(manifests),
      featureMapFragment: createFeatureMapGeneratedBlock(manifests)
    }
  };
}
function printSummary(report) { console.log('Codebase Size Reduction Phase 1 Drift Report'); console.log(`- status: ${report.status}`); for (const check of report.checks) console.log(`- ${check.status}: ${check.name}`); }
function writeGeneratedOutputs(generated) {
  const outputRoot = resolveProjectPath('artifacts/codebase-reduction/phase1');
  return {
    declarationPath: writeGeneratedArtifact({ outputRoot, relativePath: 'preload-api.generated-preview.d.ts', contents: generated.preloadDeclaration }),
    rendererPreloadBridgeDescriptorsPath: writeGeneratedArtifact({ outputRoot, relativePath: 'renderer-preload-bridge-descriptors.generated-preview.ts', contents: generated.rendererPreloadBridgeDescriptors }),
    eventChannelsPath: writeGeneratedArtifact({ outputRoot, relativePath: 'event-channels.generated-preview.ts', contents: generated.eventChannels }),
    eventPayloadMapPath: writeGeneratedArtifact({ outputRoot, relativePath: 'event-payload-map.generated-preview.ts', contents: generated.eventPayloadMap }),
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
      'renderer preload bridge descriptors preview': outputs.rendererPreloadBridgeDescriptorsPath,
      'event channels preview': outputs.eventChannelsPath,
      'event payload map preview': outputs.eventPayloadMapPath,
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
export { buildPhase1DriftReport, collectIpcManifestChannels, collectIpcManifestMethods, collectEventManifestValues, createDocsFragment, createEventChannelsPreview, createEventPayloadMapBlock, createFeatureMapGeneratedBlock, createPreloadDeclarationPreview, createRendererPreloadBridgeDescriptorPreview, extractPreloadExposures, loadManifests, writeGeneratedOutputs };
