import { describe, expect, it } from 'vitest';
import fs from 'fs';
import { buildPhase1DriftReport, createDocsFragment, createEventChannelsPreview, createEventPayloadMapBlock, createFeatureMapGeneratedBlock, createPreloadDeclarationPreview, createRendererPreloadBridgeDescriptorPreview, loadManifests } from '../../../scripts/codebase-phase1-drift-report.js';
import { extractAliasKeysFromConfigSource } from '../../../scripts/lib/alias-config.js';
const preloadTypeStub = (deviceMethod) => `interface DeviceAPI { ${deviceMethod} } interface Window { deviceAPI?: DeviceAPI; }`;
const checkNamed = (report, name) => report.checks.find((check) => check.name === name);
const replaceOnce = (source, search, replacement) => {
  const updated = source.replace(search, replacement);
  expect(updated).not.toBe(source);
  return updated;
};
const eventChannelsPath = 'src/shared/events/event-channels.ts';
const eventChannelsSource = () => fs.readFileSync(eventChannelsPath, 'utf8');
const windowBridgePath = 'src/renderer/infrastructure/services/settings/fullscreen.service.ts';
const windowBridgeSubscriptions = ['windowAPI.onEnterFullscreen', 'windowAPI.onLeaveFullscreen', 'windowAPI.onResized'];
const windowManifestBridgeCall = /this\._eventBridge = createManifestPreloadEventBridge\(\{[\s\S]*?\n      \}\);/;
const windowBridgeSource = () => fs.readFileSync(windowBridgePath, 'utf8');
const windowBridgeShadowCases = [
  { name: 'local windowAPI binding', prefix: '', setup: 'const windowAPI = makeFakeWindowAPI();', apiExpression: 'windowAPI' },
  { name: 'local window object binding', prefix: '', setup: 'const window = { windowAPI: makeFakeWindowAPI() };', apiExpression: 'window.windowAPI' },
  { name: 'namespace import window binding', prefix: "import * as window from './fake-window.js';\n", setup: '', apiExpression: 'window.windowAPI' },
  { name: 'default import window binding', prefix: "import window from './fake-window.js';\n", setup: '', apiExpression: 'window.windowAPI' },
  { name: 'local globalThis binding', prefix: '', setup: 'const globalThis = { windowAPI: makeFakeWindowAPI() };', apiExpression: 'globalThis.windowAPI' },
  { name: 'imported globalThis binding', prefix: "import globalThis from './fake-global.js';\n", setup: '', apiExpression: 'globalThis.windowAPI' },
  { name: 'side-effect import with local window binding', prefix: "import './side-effect.js';\n", setup: 'const window = { windowAPI: makeFakeWindowAPI() };', apiExpression: 'window.windowAPI' }
];
const noWindowBridgeDriftImportCases = [
  ['default import', "import Foo from './foo.js';\n"],
  ['side-effect import', "import './side-effect.js';\n"]
];
describe('codebase phase 1 drift report', () => {
  it('passes against the current manifest-owned surfaces', () => {
    const manifests = loadManifests();
    const totalManifestSubscriptions = manifests.ipc.namespaces.reduce((count, namespace) => count + (namespace.subscriptions || []).length, 0);
    const { report } = buildPhase1DriftReport(manifests), checkNames = report.checks.map((check) => check.name);
    expect(report.status).toBe('pass');
    ['ipc manifest preload exposure entries are unique', 'ipc manifest exposed methods are owned by exactly one invoke or subscription entry', 'ipc manifest subscription registry namespaces are explicit', 'preload declarations expose only manifest-owned methods', 'ipc runtime channels derive from ipc manifest', 'ipc channel type map matches ipc manifest', 'ipc manifest channel keys resolve to declared channels', 'ipc manifest handler metadata is explicit', 'main IPC handlers derive descriptor metadata from manifest', 'main IPC handlers do not define local descriptor metadata', 'renderer preload bridge wiring derives subscriptions from ipc manifest', 'preload index delegates exposure shape to manifest factory', 'renderer event channels generated preview matches checked-in source', 'ipc manifest invoke public signatures match preload declaration signatures', 'ipc manifest subscription public signatures match preload declaration signatures', 'preload payload validator metadata matches ipc manifest subscriptions', 'preload global declarations match manifest API globals', 'platform manifest labels match release build matrix', 'render pass manifest owns uniform upload metadata'].forEach((checkName) => expect(checkNames).toContain(checkName));
    expect(checkNamed(report, 'architecture aliases cover tsconfig.base aliases')).toMatchObject({ expectedCount: 6, actualCount: 6 });
    expect(checkNamed(report, 'renderer preload bridge wiring derives subscriptions from ipc manifest')).toMatchObject({
      expectedCount: totalManifestSubscriptions,
      actualCount: totalManifestSubscriptions
    });
  });
  it('fails when channel metadata is incomplete', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    manifests.ipc.namespaces[0].invoke[0].channelKey = '';
    const { report } = buildPhase1DriftReport(manifests), channelKeyCheck = checkNamed(report, 'ipc manifest channel keys resolve to declared channels');
    expect(report.status).toBe('fail'); expect(checkNamed(report, 'ipc runtime channels derive from ipc manifest')).toMatchObject({ status: 'fail' });
    expect(channelKeyCheck).toMatchObject({ status: 'fail' });
    expect(channelKeyCheck.missing).toEqual(expect.arrayContaining(['DEVICE. device:get-status']));
    expect(channelKeyCheck.extra).toEqual(expect.arrayContaining(['DEVICE. IPC_CHANNELS.DEVICE.']));
  });
  it('fails when EventChannels path-to-value mappings drift from renderer event manifest entries', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    const swappedEventChannelsSource = eventChannelsSource()
      .replace("STATUS_CHANGED: getRendererChannel('device', 'status-changed'),", "STATUS_CHANGED: getRendererChannel('device', 'supported-device-available'),")
      .replace("SUPPORTED_DEVICE_AVAILABLE: getRendererChannel('device', 'supported-device-available'),", "SUPPORTED_DEVICE_AVAILABLE: getRendererChannel('device', 'status-changed'),");
    const { report } = buildPhase1DriftReport(manifests, { eventChannelsSource: swappedEventChannelsSource }), eventCheck = checkNamed(report, 'renderer event manifest matches EventChannels values');
    expect(report.status).toBe('fail'); expect(eventCheck).toMatchObject({ status: 'fail' });
    expect(eventCheck.missing).toEqual(expect.arrayContaining(['EventChannels.DEVICE.STATUS_CHANGED device:status-changed', 'EventChannels.DEVICE.SUPPORTED_DEVICE_AVAILABLE device:supported-device-available']));
    expect(eventCheck.extra).toEqual(expect.arrayContaining(['EventChannels.DEVICE.STATUS_CHANGED device:supported-device-available', 'EventChannels.DEVICE.SUPPORTED_DEVICE_AVAILABLE device:status-changed']));
  });
  it('fails closed when EventChannels source cannot be parsed', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    const eventCheck = checkNamed(buildPhase1DriftReport(manifests, { eventChannelsSource: `${eventChannelsSource()}\nconst broken = ;` }).report, 'renderer event manifest matches EventChannels values');
    expect(eventCheck).toMatchObject({ status: 'fail', expectedCount: 73, actualCount: 0, missing: expect.arrayContaining(['EventChannels.DEVICE.STATUS_CHANGED device:status-changed']) });
  });
  it('fails when the checked-in EventChannels source drifts from the manifest-generated preview', () => {
    const source = replaceOnce(eventChannelsSource(), '// Device events', '// Device runtime events');
    const { report } = buildPhase1DriftReport(loadManifests(), { eventChannelsSource: source });
    expect(checkNamed(report, 'renderer event manifest matches EventChannels values')).toMatchObject({ status: 'pass' });
    expect(checkNamed(report, 'renderer event channels generated preview matches checked-in source')).toMatchObject({
      status: 'fail',
      missing: ['generated source parity'],
      extra: ['checked-in source drift']
    });
  });
  it('fails when the generated EventChannels preview is inactive', () => {
    const manifests = loadManifests();
    const source = `/*\n${createEventChannelsPreview(manifests.events)}\n*/\nexport const EventChannels = {};`;
    expect(checkNamed(buildPhase1DriftReport(manifests, { eventChannelsSource: source }).report, 'renderer event channels generated preview matches checked-in source')).toMatchObject({ status: 'fail' });
  });
  it('fails when the checked-in EventChannels generator logic drifts', () => {
    const source = eventChannelsSource().replace('const manifestValue = rendererEventChannelsByKey.get(key);', "const manifestValue = `${domain}:${name}`;");
    expect(checkNamed(buildPhase1DriftReport(loadManifests(), { eventChannelsSource: source }).report, 'renderer event channels generated preview matches checked-in source')).toMatchObject({ status: 'fail' });
  });
  it('fails when the compact EventPayloadMap no longer derives from generated payload aliases', () => {
    const compactMapShape = 'export type EventPayloadMap = {\n  [K in EventChannelValue]: K extends keyof EventPayloadOverrides\n    ? EventPayloadOverrides[K]\n    : K extends VoidEventChannel\n      ? void\n      : unknown;\n};';
    const source = replaceOnce(
      fs.readFileSync('src/shared/events/event-payloads.ts', 'utf8'),
      compactMapShape,
      'export type EventPayloadMap = { [K in EventChannelValue]: unknown; };'
    ) + `\n/* ${compactMapShape} */`;
    const { report } = buildPhase1DriftReport(loadManifests(), { eventPayloadsSource: source });
    expect(checkNamed(report, 'renderer EventPayloadMap derives from generated payload aliases')).toMatchObject({ status: 'fail' });
  });
  it('fails when the generated payload override block drifts from the manifest', () => {
    const sourceText = fs.readFileSync('src/shared/events/event-payloads.ts', 'utf8');
    const source = replaceOnce(sourceText, '  [EventChannels.SYSTEM.HANDLER_ERROR]: HandlerErrorPayload;', '  /* [EventChannels.SYSTEM.HANDLER_ERROR]: HandlerErrorPayload; */');
    const payloadCheck = checkNamed(buildPhase1DriftReport(loadManifests(), { eventPayloadsSource: source }).report, 'renderer event manifest payloads match EventPayloadMap');
    expect(payloadCheck).toMatchObject({ status: 'fail', missing: [], extra: ['generated block drift'] });
  });
  it('fails when the generated void payload block drifts from the manifest', () => {
    const sourceText = fs.readFileSync('src/shared/events/event-payloads.ts', 'utf8');
    const source = replaceOnce(sourceText, 'type VoidEventChannel = typeof EventChannels.DEVICE.DISCONNECTED_DURING_SESSION | ', 'type VoidEventChannel = /* typeof EventChannels.DEVICE.DISCONNECTED_DURING_SESSION | */ ');
    const payloadCheck = checkNamed(buildPhase1DriftReport(loadManifests(), { eventPayloadsSource: source }).report, 'renderer event manifest payloads match EventPayloadMap');
    expect(payloadCheck).toMatchObject({ status: 'fail', missing: [], extra: ['generated block drift'] });
  });
  it('fails when the generated payload block is inactive but weak live aliases remain', () => {
    const manifests = loadManifests(), generatedBlock = createEventPayloadMapBlock(manifests.events);
    const source = replaceOnce(fs.readFileSync('src/shared/events/event-payloads.ts', 'utf8'), generatedBlock, `/*\n${generatedBlock}\n*/\ntype VoidEventChannel = never;\n\ntype EventPayloadOverrides = {};`);
    const payloadCheck = checkNamed(buildPhase1DriftReport(manifests, { eventPayloadsSource: source }).report, 'renderer event payload aliases are active generated declarations');
    expect(payloadCheck).toMatchObject({ status: 'fail', missing: ['generated source parity'], extra: ['checked-in source drift'] });
  });
  it('fails when generated payload markers are inactive but live generated aliases remain', () => {
    const manifests = loadManifests(), generatedBlock = createEventPayloadMapBlock(manifests.events);
    const source = replaceOnce(fs.readFileSync('src/shared/events/event-payloads.ts', 'utf8'), generatedBlock, `/*\n${generatedBlock}\n*/\n${generatedBlock.split('\n').slice(1, -1).join('\n')}`);
    const { report } = buildPhase1DriftReport(manifests, { eventPayloadsSource: source });
    expect(checkNamed(report, 'renderer event payload aliases are active generated declarations')).toMatchObject({ status: 'pass' });
    expect(checkNamed(report, 'renderer event manifest payloads match EventPayloadMap')).toMatchObject({ status: 'fail' });
  });
  it('fails when generated payload aliases are hidden below weak top-level aliases', () => {
    const manifests = loadManifests(), generatedBlock = createEventPayloadMapBlock(manifests.events);
    const source = replaceOnce(fs.readFileSync('src/shared/events/event-payloads.ts', 'utf8'), generatedBlock, `type VoidEventChannel = never;\n\ntype EventPayloadOverrides = {};\n\nnamespace HiddenGeneratedPayloadAliases {\n${generatedBlock}\n}`);
    const payloadCheck = checkNamed(buildPhase1DriftReport(manifests, { eventPayloadsSource: source }).report, 'renderer event payload aliases are active generated declarations');
    expect(payloadCheck).toMatchObject({ status: 'fail', missing: ['generated source parity'], extra: ['checked-in source drift'] });
  });
  it('fails when manifest-backed IPC handler descriptors drift from manifest invoke methods or include local metadata keys', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests())), updateHandlerPath = 'src/main/ipc/handlers/update.handler.ts', deviceHandlerPath = 'src/main/ipc/handlers/device.handler.ts', gpuHandlerPath = 'src/main/ipc/handlers/gpu.handler.ts';
    const { report } = buildPhase1DriftReport(manifests, { handlerSourceOverrides: { [updateHandlerPath]: fs.readFileSync(updateHandlerPath, 'utf8').replace("method: 'getStatus',", "method: 'getStatusLegacy',"), [deviceHandlerPath]: fs.readFileSync(deviceHandlerPath, 'utf8').replace("defineManifestIpcHandlers<DeviceHandlerDependencies>('deviceAPI', [", "defineManifestIpcHandlers<DeviceHandlerDependencies>('deviceAPI', [\n  ...hiddenDescriptors,").replace("method: 'getDeviceStatus',", "method: 'getDeviceStatus',\n    dependencyTokens: ['deviceService', 'logger'],\n    ...{ responseMode: 'bare' },"), [gpuHandlerPath]: `${fs.readFileSync(gpuHandlerPath, 'utf8')}\nconst broken = ;` } });
    const methodsCheck = checkNamed(report, 'main IPC handlers derive descriptor metadata from manifest'), metadataCheck = checkNamed(report, 'main IPC handlers do not define local descriptor metadata');
    expect(report.status).toBe('fail'); expect(methodsCheck).toMatchObject({ status: 'fail' }); expect(methodsCheck.missing).toContain('updateAPI.getStatus'); expect(methodsCheck.extra).toContain('updateAPI.getStatusLegacy');
    expect(metadataCheck).toMatchObject({ status: 'fail' }); expect(metadataCheck.extra).toContain('deviceAPI.getDeviceStatus.dependencyTokens');
    expect(metadataCheck.extra).toEqual(expect.arrayContaining(['deviceAPI.getDeviceStatus.spread', 'deviceAPI.unknown.descriptorSpread', 'src/main/ipc/handlers/gpu.handler.ts.parseDiagnostics']));
  });
  it('fails when renderer preload bridge handlers drift from ipc manifest subscriptions', () => {
    const updatePath = 'src/renderer/infrastructure/services/updates/update.service.ts', transcodePath = 'src/renderer/infrastructure/services/transcode/transcode.service.ts', devicePath = 'src/renderer/infrastructure/adapters/devices/device-ipc.adapter.ts';
    const { report } = buildPhase1DriftReport(loadManifests(), { rendererBridgeSourceOverrides: { [updatePath]: fs.readFileSync(updatePath, 'utf8').replace('api: window.updateAPI', 'api: window.transcodeAPI').replace('this._eventBridge = createManifestPreloadEventBridge({', 'const RendererPreloadBridgeDescriptors = { updateAPI: null };\n    this._eventBridge = createManifestPreloadEventBridge({').replace('handlers: {', 'manifest: { namespaces: [] },\n      ...bridgeOptions,\n      handlers: {').replace('onError: (error: UpdateErrorPayload) => this._handleError(error)', 'onUnexpectedError: (error: UpdateErrorPayload) => this._handleError(error)'), [transcodePath]: fs.readFileSync(transcodePath, 'utf8').replace('createManifestPreloadEventBridge({', 'bridgeFactory.createManifestPreloadEventBridge({'), [devicePath]: fs.readFileSync(devicePath, 'utf8').replace('createManifestPreloadEventBridge,', 'createPreloadEventBridge,\n  createManifestPreloadEventBridge,').replace('this._eventBridge = createManifestPreloadEventBridge({', 'void createManifestPreloadEventBridge({').replace('return () => this._disposeBridge(eventBridge);', "const api = window.deviceAPI;\n    const deps = { api: window.deviceAPI };\n    const shorthandDeps = { api };\n    const args = [window.deviceAPI, handleConnected, handleDisconnected];\n    const helper = { api: window.deviceAPI, subscribe: subscribeDeviceEvents };\n    const manualSubscriptions = { subscribe: subscribeDeviceEvents, add: subscribeDeviceEvents };\n    const mutableDeps = {};\n    mutableDeps.api = window.deviceAPI;\n    const mutableArgs = [];\n    mutableArgs[0] = window.deviceAPI;\n    const provider = { getApi: () => window.deviceAPI, getApiMethod() { return window.deviceAPI; } };\n    const createProvider = () => ({ getApi: () => window.deviceAPI, current: () => window.deviceAPI });\n    const providerCopy = provider;\n    const { getApi: destructuredGetApi } = provider;\n    const dynamicProvider = {};\n    dynamicProvider.getApi = () => window.deviceAPI;\n    const accessorProvider = { get api() { return window.deviceAPI; } };\n    class DeviceApiProvider { getApi() { return window.deviceAPI; } }\n    this._api = window.deviceAPI;\n    this._deps = { api: window.deviceAPI };\n    this._provider = { getApi: () => window.deviceAPI };\n    let assignedApi;\n    ({ api: assignedApi } = { api: window.deviceAPI });\n    const providerApi = createProvider().current();\n    const providerArgs = [createProvider().current(), handleConnected, handleDisconnected];\n    const fallbackApi = window.deviceAPI ?? null;\n    const getApi = () => window.deviceAPI;\n    function getDeviceApi() { return window.deviceAPI; }\n    subscribeDeviceEvents(api, handleConnected, handleDisconnected);\n    subscribeDeviceEvents({ api: window.deviceAPI, onConnected: handleConnected });\n    subscribeDeviceEvents({ ...shorthandDeps, onConnected: handleConnected });\n    subscribeDeviceEvents(deps, handleConnected, handleDisconnected);\n    subscribeDeviceEvents(deps.api, handleConnected, handleDisconnected);\n    subscribeDeviceEvents(...args);\n    subscribeDeviceEvents(...[api, handleConnected]);\n    subscribeDeviceEvents(mutableDeps, handleConnected, handleDisconnected);\n    subscribeDeviceEvents(...mutableArgs);\n    subscribeDeviceEvents(providerApi, handleConnected, handleDisconnected);\n    subscribeDeviceEvents(...providerArgs);\n    subscribeDeviceEvents(this._api, handleConnected, handleDisconnected);\n    subscribeDeviceEvents(this._deps, handleConnected, handleDisconnected);\n    subscribeDeviceEvents(provider.getApi(), handleConnected, handleDisconnected);\n    subscribeDeviceEvents(provider['getApi'](), handleConnected, handleDisconnected);\n    subscribeDeviceEvents(providerCopy.getApi(), handleConnected, handleDisconnected);\n    subscribeDeviceEvents(destructuredGetApi(), handleConnected, handleDisconnected);\n    subscribeDeviceEvents(dynamicProvider.getApi(), handleConnected, handleDisconnected);\n    subscribeDeviceEvents(accessorProvider.api, handleConnected, handleDisconnected);\n    subscribeDeviceEvents(new DeviceApiProvider().getApi(), handleConnected, handleDisconnected);\n    subscribeDeviceEvents(createProvider().getApi() ?? null, handleConnected, handleDisconnected);\n    subscribeDeviceEvents(handleConnected ? createProvider().getApi() : null, handleConnected, handleDisconnected);\n    subscribeDeviceEvents({ api: createProvider().getApi(), onConnected: handleConnected });\n    new DeviceEventSubscriptionHelper(createProvider().getApi() ?? null, handleConnected, handleDisconnected);\n    manualSubscriptions.subscribe(createProvider().getApi(), handleConnected, handleDisconnected);\n    manualSubscriptions.add(createProvider().getApi(), handleConnected, handleDisconnected);\n    manualSubscriptions.subscribe(dynamicProvider.getApi(), handleConnected, handleDisconnected);\n    subscribeDeviceEvents(provider.getApiMethod(), handleConnected, handleDisconnected);\n    subscribeDeviceEvents(this._provider.getApi(), handleConnected, handleDisconnected);\n    subscribeDeviceEvents(assignedApi, handleConnected, handleDisconnected);\n    subscribeDeviceEvents(fallbackApi, handleConnected, handleDisconnected);\n    subscribeDeviceEvents(getApi(), handleConnected, handleDisconnected);\n    subscribeDeviceEvents(getDeviceApi(), handleConnected, handleDisconnected);\n    new DeviceEventSubscriptionHelper(window.deviceAPI, handleConnected, handleDisconnected);\n    registerDeviceHelper(new DeviceEventSubscriptionHelper(api));\n    helper.subscribe(handleConnected, handleDisconnected);\n    window.deviceAPI.onDeviceConnected(onDeviceConnected);\n    const { onDeviceDisconnected: disconnected } = window.deviceAPI;\n    disconnected(onDeviceDisconnected);\n    const { createPreloadEventBridge: manualBridge } = bridgeFactory;\n    this._eventBridge = manualBridge({ api: window.deviceAPI as DeviceApiLike, bridgeName: 'DeviceIpcAdapter', subscriptions: [] });\n    return () => this._disposeBridge(eventBridge);") } }), bridgeCheck = checkNamed(report, 'renderer preload bridge wiring derives subscriptions from ipc manifest');
    expect(report.status).toBe('fail'); expect(bridgeCheck).toMatchObject({ status: 'fail' });
    expect(bridgeCheck.missing).toEqual(expect.arrayContaining(['updateAPI.onError', 'transcodeAPI.onProgress', 'deviceAPI.onDeviceConnected']));
    expect(bridgeCheck.extra).toEqual(expect.arrayContaining(['RendererPreloadBridgeDescriptors.updateAPI.onUnexpectedError', `${updatePath}: bridge binding shadowed`, `${updatePath}: apiName RendererPreloadBridgeDescriptors.updateAPI`, `${updatePath}: api window.transcodeAPI`, `${updatePath}: option manifest`, `${updatePath}: options spread`, `${transcodePath}: transcodeAPI helper argument`, `${devicePath}: createPreloadEventBridge`, `${devicePath}: deviceAPI helper argument`, `${devicePath}: deviceAPI.onDeviceConnected`, `${devicePath}: deviceAPI.onDeviceDisconnected`]));
    expect(bridgeCheck.extra.filter((entry) => entry === `${devicePath}: deviceAPI helper argument`).length).toBeGreaterThanOrEqual(32);
  });
  it('fails when renderer subscription consumer coverage omits a manifest namespace', () => {
    const manifests = loadManifests();
    const totalManifestSubscriptions = manifests.ipc.namespaces.reduce((count, namespace) => count + (namespace.subscriptions || []).length, 0);
    const windowSubscriptions = (manifests.ipc.namespaces.find((namespace) => namespace.apiName === 'windowAPI')?.subscriptions || []).length;
    const { report } = buildPhase1DriftReport(manifests, {
      rendererBridgeConsumers: {
        windowAPI: null
      }
    });
    const bridgeCheck = checkNamed(report, 'renderer preload bridge wiring derives subscriptions from ipc manifest');
    expect(report.status).toBe('fail');
    expect(bridgeCheck.expectedCount).toBe(totalManifestSubscriptions - windowSubscriptions);
    expect(bridgeCheck.extra).toContain(`renderer subscription coverage mismatch expected=${totalManifestSubscriptions - windowSubscriptions} manifest=${totalManifestSubscriptions}`);
  });
  it('fails when renderer preload bridge descriptors drift from the IPC manifest', () => {
    const manifests = loadManifests(), generated = createRendererPreloadBridgeDescriptorPreview(manifests.ipc), drifted = replaceOnce(generated, '[...namespace.subscriptions].map(derivePublicMethodName)', '[]');
    expect(checkNamed(buildPhase1DriftReport(manifests, { rendererPreloadBridgeDescriptorsSource: drifted }).report, 'renderer preload bridge descriptors match ipc manifest')).toMatchObject({ status: 'fail' });
  });
  it('fails when renderer preload bridge descriptors are hidden in an inactive preview', () => {
    const manifests = loadManifests(), generated = createRendererPreloadBridgeDescriptorPreview(manifests.ipc);
    const source = `/*\n${generated}\n*/\nexport const RendererPreloadBridgeDescriptors = {};`;
    expect(checkNamed(buildPhase1DriftReport(manifests, { rendererPreloadBridgeDescriptorsSource: source }).report, 'renderer preload bridge descriptors match ipc manifest')).toMatchObject({ status: 'fail' });
  });
  it('fails when a hidden renderer preload bridge preview appears before a weak active export', () => {
    const manifests = loadManifests(), generated = createRendererPreloadBridgeDescriptorPreview(manifests.ipc), source = `/*\n${generated}\n*/\n// CODEBASE_RENDERER_PRELOAD_BRIDGE_DESCRIPTORS:START\nexport const RendererPreloadBridgeDescriptors = {};\n// CODEBASE_RENDERER_PRELOAD_BRIDGE_DESCRIPTORS:END`;
    expect(checkNamed(buildPhase1DriftReport(manifests, { rendererPreloadBridgeDescriptorsSource: source }).report, 'renderer preload bridge descriptors match ipc manifest')).toMatchObject({ status: 'fail' });
  });
  it('fails when manifest-backed descriptor metadata keys are computed', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    const deviceHandlerPath = 'src/main/ipc/handlers/device.handler.ts';
    const source = fs.readFileSync(deviceHandlerPath, 'utf8')
      .replace(
        "export const deviceHandlerDescriptors = defineManifestIpcHandlers<DeviceHandlerDependencies>('deviceAPI', [",
        "const dependencyTokens = ['deviceService'], responseMode = 'bare', metadataKey = 'channel';\nexport const deviceHandlerDescriptors = defineManifestIpcHandlers<DeviceHandlerDependencies>('deviceAPI', ["
      )
      .replace(
        "method: 'getDeviceStatus',",
        "method: 'getDeviceStatus',\n    dependencyTokens,\n    responseMode,\n    ['argument' + 'Schema']: [],\n    [metadataKey]: 'device:get-status',"
      );
    const { report } = buildPhase1DriftReport(manifests, {
      handlerSourceOverrides: {
        [deviceHandlerPath]: source
      }
    });
    const metadataCheck = checkNamed(report, 'main IPC handlers do not define local descriptor metadata');
    expect(report.status).toBe('fail');
    expect(metadataCheck.extra).toEqual(expect.arrayContaining([
      'deviceAPI.getDeviceStatus.responseMode',
      'deviceAPI.getDeviceStatus.dependencyTokens',
      'deviceAPI.getDeviceStatus.argumentSchema',
      'deviceAPI.getDeviceStatus.computedPropertyName'
    ]));
  });
  it('fails when windowAPI manifest bridge wiring is removed but same-named locals remain', () => {
    const source = replaceOnce(fs.readFileSync(windowBridgePath, 'utf8'), windowManifestBridgeCall, 'const onEnterFullscreen = null, onLeaveFullscreen = null, onResized = null;');
    const { report } = buildPhase1DriftReport(loadManifests(), { rendererBridgeSourceOverrides: { [windowBridgePath]: source } });
    const bridgeCheck = checkNamed(report, 'renderer preload bridge wiring derives subscriptions from ipc manifest');
    expect(report.status).toBe('fail');
    expect(bridgeCheck).toMatchObject({ status: 'fail' });
    expect(bridgeCheck.missing).toEqual(expect.arrayContaining(windowBridgeSubscriptions));
  });
  windowBridgeShadowCases.forEach(({ name, prefix, setup, apiExpression }) => {
    it(`fails when windowAPI manifest bridge wiring uses ${name}`, () => {
      const baseSource = `${prefix}${windowBridgeSource()}`;
      const sourceWithSetup = setup ? replaceOnce(baseSource, 'if (window.windowAPI) {\n', `if (window.windowAPI) {\n      ${setup}\n`) : baseSource;
      const source = apiExpression === 'window.windowAPI'
        ? sourceWithSetup
        : replaceOnce(sourceWithSetup, 'api: window.windowAPI,', `api: ${apiExpression},`);
      const { report } = buildPhase1DriftReport(loadManifests(), { rendererBridgeSourceOverrides: { [windowBridgePath]: source } });
      const bridgeCheck = checkNamed(report, 'renderer preload bridge wiring derives subscriptions from ipc manifest');
      expect(report.status).toBe('fail');
      expect(bridgeCheck).toMatchObject({ status: 'fail' });
      expect(bridgeCheck.extra).toContain(`${windowBridgePath}: api ${apiExpression}`);
    });
  });
  it('fails when windowAPI manifest bridge wiring is routed through a manual event bridge', () => {
    const manualBridgeSource = replaceOnce(windowBridgeSource(), windowManifestBridgeCall, "this._eventBridge = createPreloadEventBridge({ api: window.windowAPI, bridgeName: 'SettingsFullscreenService', logger: this.logger, subscriptions: [{ id: 'onEnterFullscreen', subscribe: (api) => api.onEnterFullscreen(() => this._handleNativeFullscreen(true)) }, { id: 'onLeaveFullscreen', subscribe: (api) => api.onLeaveFullscreen(() => this._handleNativeFullscreen(false)) }, { id: 'onResized', subscribe: (api) => api.onResized(() => { this._syncFullscreenState(); this.eventBus.publish(EventChannels.UI.WINDOW_RESIZED); }) }] });");
    const { report: manualReport } = buildPhase1DriftReport(loadManifests(), { rendererBridgeSourceOverrides: { [windowBridgePath]: manualBridgeSource } });
    const manualBridgeCheck = checkNamed(manualReport, 'renderer preload bridge wiring derives subscriptions from ipc manifest');
    expect(manualReport.status).toBe('fail');
    expect(manualBridgeCheck).toMatchObject({ status: 'fail' });
    expect(manualBridgeCheck.missing).toEqual(expect.arrayContaining(windowBridgeSubscriptions));
    expect(manualBridgeCheck.extra).toContain(`${windowBridgePath}: createPreloadEventBridge`);
  });
  it('fails when windowAPI manifest bridge wiring is replaced by direct subscriptions', () => {
    const directSubscriptionSource = replaceOnce(windowBridgeSource(), windowManifestBridgeCall, 'this._unsubscribeEnterFullscreen = window.windowAPI.onEnterFullscreen(() => this._handleNativeFullscreen(true)); this._unsubscribeLeaveFullscreen = window.windowAPI.onLeaveFullscreen(() => this._handleNativeFullscreen(false)); this._unsubscribeResized = window.windowAPI.onResized(() => { this._syncFullscreenState(); this.eventBus.publish(EventChannels.UI.WINDOW_RESIZED); });');
    const { report: directReport } = buildPhase1DriftReport(loadManifests(), { rendererBridgeSourceOverrides: { [windowBridgePath]: directSubscriptionSource } });
    const directBridgeCheck = checkNamed(directReport, 'renderer preload bridge wiring derives subscriptions from ipc manifest');
    expect(directReport.status).toBe('fail');
    expect(directBridgeCheck).toMatchObject({ status: 'fail' });
    expect(directBridgeCheck.missing).toEqual(expect.arrayContaining(windowBridgeSubscriptions));
    expect(directBridgeCheck.extra).toEqual(expect.arrayContaining(
      windowBridgeSubscriptions.map((subscription) => `${windowBridgePath}: ${subscription}`)
    ));
  });
  noWindowBridgeDriftImportCases.forEach(([name, importSource]) => {
    it(`does not report windowAPI bridge drift for a ${name}`, () => {
      const source = `${importSource}${windowBridgeSource()}`;
      const { report } = buildPhase1DriftReport(loadManifests(), { rendererBridgeSourceOverrides: { [windowBridgePath]: source } });
      const bridgeCheck = checkNamed(report, 'renderer preload bridge wiring derives subscriptions from ipc manifest');
      expect(bridgeCheck.missing.filter((entry) => entry.startsWith('windowAPI.'))).toEqual([]);
      expect(bridgeCheck.extra.filter((entry) => entry.startsWith(`${windowBridgePath}:`))).toEqual([]);
    });
  });
  it('fails when manifest bridge api wiring uses a shadowed global object', () => {
    const path = 'src/renderer/infrastructure/services/updates/update.service.ts';
    const { report } = buildPhase1DriftReport(loadManifests(), {
      rendererBridgeSourceOverrides: {
        [path]: `import * as window from './fake-window.js';\n${fs.readFileSync(path, 'utf8')}`
      }
    });
    const bridgeCheck = checkNamed(report, 'renderer preload bridge wiring derives subscriptions from ipc manifest');
    expect(report.status).toBe('fail');
    expect(bridgeCheck.extra).toContain(`${path}: api window.updateAPI`);
  });
  it('fails closed for computed renderer subscription member access unless statically resolvable', () => {
    const updatePath = 'src/renderer/infrastructure/services/updates/update.service.ts';
    const devicePath = 'src/renderer/infrastructure/adapters/devices/device-ipc.adapter.ts';
    const { report } = buildPhase1DriftReport(loadManifests(), {
      rendererBridgeSourceOverrides: {
        [updatePath]: fs.readFileSync(updatePath, 'utf8').replace(
          'this._initialized = true;',
          "window.updateAPI['on' + 'Error']((error: UpdateErrorPayload) => this._handleError(error));\n    const onErrorMethod = 'onError';\n    window.updateAPI[onErrorMethod]((error: UpdateErrorPayload) => this._handleError(error));\n\n    this._initialized = true;"
        ),
        [devicePath]: fs.readFileSync(devicePath, 'utf8').replace(
          'return () => this._disposeBridge(eventBridge);',
          "const alias = window.deviceAPI;\n    alias['on' + 'DeviceConnected'](handleConnected);\n    const deviceMethod = 'onDeviceConnected';\n    alias[deviceMethod](handleConnected);\n\n    return () => this.dispose();"
        )
      }
    });
    const bridgeCheck = checkNamed(report, 'renderer preload bridge wiring derives subscriptions from ipc manifest');
    expect(report.status).toBe('fail');
    expect(bridgeCheck.extra).toEqual(expect.arrayContaining([
      `${updatePath}: updateAPI.onError`,
      `${updatePath}: updateAPI.computedProperty`,
      `${devicePath}: deviceAPI.onDeviceConnected`,
      `${devicePath}: deviceAPI.computedProperty`
    ]));
  });
  it('fails when the IPC manifest authority mode is downgraded', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    manifests.ipc.mode = 'report-only'; const { report } = buildPhase1DriftReport(manifests);
    expect(checkNamed(report, 'ipc manifest is enforced')).toMatchObject({ status: 'fail', actual: 'report-only', missing: ['mode=enforced'] });
  });
  it('fails when subscription registry namespace metadata is missing', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    delete manifests.ipc.namespaces[0].registryNamespace;
    const { report } = buildPhase1DriftReport(manifests);
    expect(checkNamed(report, 'ipc manifest subscription registry namespaces are explicit')).toMatchObject({ status: 'fail', missing: ['deviceAPI.onDeviceConnected', 'deviceAPI.onDeviceDisconnected'] });
  });
  it('fails when subscription registry namespace metadata is blank after trimming', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    manifests.ipc.namespaces[0].registryNamespace = ' ';
    const { report } = buildPhase1DriftReport(manifests);
    expect(checkNamed(report, 'ipc manifest subscription registry namespaces are explicit')).toMatchObject({ status: 'fail', missing: ['deviceAPI.onDeviceConnected', 'deviceAPI.onDeviceDisconnected'] });
  });
  it('fails when derived subscription registry keys collide', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    const windowNamespace = manifests.ipc.namespaces.find((entry) => entry.apiName === 'windowAPI');
    windowNamespace.registryNamespace = 'device'; windowNamespace.subscriptions[0].factoryMethod = 'onDeviceConnected';
    const { report } = buildPhase1DriftReport(manifests);
    expect(checkNamed(report, 'ipc manifest subscription registry namespaces are explicit')).toMatchObject({ status: 'fail', extra: ['device.onDeviceConnected'] });
  });
  it('fails when an invoke response schema drifts from preload declarations', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    manifests.ipc.namespaces[0].invoke[0].response = 'WindowIsFullscreenResponse';
    const { report } = buildPhase1DriftReport(manifests), responseCheck = checkNamed(report, 'ipc manifest invoke public signatures match preload declaration signatures');
    expect(report.status).toBe('fail');
    expect(responseCheck).toMatchObject({ status: 'fail', missing: ['device:get-status (): Promise<DeviceStatusPayload>'], extra: ['device:get-status (): Promise<WindowIsFullscreenResponse>'] });
  });
  it('fails when preload declaration invoke arguments drift from manifest signatures', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    const preloadTypeSource = 'interface ShellAPI { openExternal(): Promise<ShellOpenExternalResponse>; } interface Window { shellAPI?: ShellAPI; }';
    const { report } = buildPhase1DriftReport(manifests, { preloadTypeSource }), responseCheck = checkNamed(report, 'ipc manifest invoke public signatures match preload declaration signatures');
    expect(report.status).toBe('fail'); expect(responseCheck.missing).toContain('shell:open-external (): Promise<ShellOpenExternalResponse>');
    expect(responseCheck.extra).toContain('shell:open-external (url: string): Promise<ShellOpenExternalResponse>');
  });
  it('fails when preload declaration invoke argument types drift from manifest signatures', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    const preloadTypeSource = 'interface WindowAPI { setFullScreen(enabled: string): Promise<WindowSetFullscreenResponse>; } interface Window { windowAPI?: WindowAPI; }';
    const { report } = buildPhase1DriftReport(manifests, { preloadTypeSource }), responseCheck = checkNamed(report, 'ipc manifest invoke public signatures match preload declaration signatures');
    expect(report.status).toBe('fail');
    expect(responseCheck.missing).toContain('window:set-fullscreen (enabled: string): Promise<WindowSetFullscreenResponse>');
    expect(responseCheck.extra).toContain('window:set-fullscreen (enabled: boolean): Promise<WindowSetFullscreenResponse>');
  });
  it('fails when preload declaration invoke methods stop returning promises', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    const preloadTypeSource = preloadTypeStub('getDeviceStatus(): DeviceStatusPayload;');
    const { report } = buildPhase1DriftReport(manifests, { preloadTypeSource }), responseCheck = checkNamed(report, 'ipc manifest invoke public signatures match preload declaration signatures');
    expect(report.status).toBe('fail');
    expect(responseCheck.extra).toContain('device:get-status (): Promise<DeviceStatusPayload>');
    expect(responseCheck.missing).toContain('device:get-status (): DeviceStatusPayload');
  });
  it('fails when manifest-owned invoke methods have overloaded preload declarations', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    const preloadTypeSource = preloadTypeStub(
      'getDeviceStatus(): DeviceStatusPayload; getDeviceStatus(): Promise<DeviceStatusPayload>;'
    );
    const { report } = buildPhase1DriftReport(manifests, { preloadTypeSource }), responseCheck = checkNamed(report, 'ipc manifest invoke public signatures match preload declaration signatures');
    expect(report.status).toBe('fail');
    expect(responseCheck.extra).toContain('device:get-status (): Promise<DeviceStatusPayload>');
    expect(responseCheck.missing).toContain('device:get-status declaration-count:2 compatible-count:1');
  });
  it('fails when manifest-owned invoke overloads are split across merged interfaces', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    const preloadTypeSource = [
      'interface DeviceAPI { getDeviceStatus(): DeviceStatusPayload; }',
      'interface DeviceAPI { getDeviceStatus(): Promise<DeviceStatusPayload>; }',
      'interface Window { deviceAPI?: DeviceAPI; }'
    ].join(' ');
    const { report } = buildPhase1DriftReport(manifests, { preloadTypeSource }), responseCheck = checkNamed(report, 'ipc manifest invoke public signatures match preload declaration signatures');
    expect(report.status).toBe('fail');
    expect(responseCheck.extra).toContain('device:get-status (): Promise<DeviceStatusPayload>');
    expect(responseCheck.missing).toContain('device:get-status declaration-count:2 compatible-count:1');
  });
  it('fails when another included declaration file adds a duplicate DeviceAPI overload', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    const preloadTypeSources = [
      {
        filePath: 'src/types/preload-api.d.ts',
        sourceText: preloadTypeStub('getDeviceStatus(): Promise<DeviceStatusPayload>;')
      },
      {
        filePath: 'src/types/device-overload.d.ts',
        sourceText: 'interface DeviceAPI { getDeviceStatus(): DeviceStatusPayload; }'
      }
    ];
    const { report } = buildPhase1DriftReport(manifests, { preloadTypeSources }), responseCheck = checkNamed(report, 'ipc manifest invoke public signatures match preload declaration signatures');
    expect(report.status).toBe('fail');
    expect(responseCheck.extra).toContain('device:get-status (): Promise<DeviceStatusPayload>');
    expect(responseCheck.missing).toContain('device:get-status declaration-count:2 compatible-count:1');
  });
  it('fails when a subscription payload schema drifts from preload declarations', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    manifests.ipc.namespaces[0].subscriptions[0].payload = 'void';
    const { report } = buildPhase1DriftReport(manifests), payloadCheck = checkNamed(report, 'ipc manifest subscription public signatures match preload declaration signatures');
    expect(report.status).toBe('fail');
    expect(payloadCheck).toMatchObject({
      status: 'fail',
      missing: ['device:connected (callback: (payload: DeviceInfoPayload) => void): Unsubscribe'],
      extra: ['device:connected (callback: () => void): Unsubscribe']
    });
  });
  it('fails when subscription return types drift from manifest signatures', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    const preloadTypeSource = preloadTypeStub(
      'onDeviceConnected(callback: (device: DeviceInfoPayload) => void): void;'
    );
    const { report } = buildPhase1DriftReport(manifests, { preloadTypeSource }), payloadCheck = checkNamed(report, 'ipc manifest subscription public signatures match preload declaration signatures');
    expect(report.status).toBe('fail');
    expect(payloadCheck.missing).toContain('device:connected (callback: (payload: DeviceInfoPayload) => void): void');
    expect(payloadCheck.extra).toContain('device:connected (callback: (payload: DeviceInfoPayload) => void): Unsubscribe');
  });
  it('fails when subscription callback return types drift from manifest signatures', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    const preloadTypeSource = preloadTypeStub(
      'onDeviceConnected(callback: (device: DeviceInfoPayload) => Promise<void>): Unsubscribe;'
    );
    const { report } = buildPhase1DriftReport(manifests, { preloadTypeSource }), payloadCheck = checkNamed(report, 'ipc manifest subscription public signatures match preload declaration signatures');
    expect(report.status).toBe('fail');
    expect(payloadCheck.missing).toContain('device:connected (callback: (payload: DeviceInfoPayload) => Promise<void>): Unsubscribe');
    expect(payloadCheck.extra).toContain('device:connected (callback: (payload: DeviceInfoPayload) => void): Unsubscribe');
  });
  it('fails when subscription callbacks declare unsupported payload arity', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    const preloadTypeSource = preloadTypeStub(
      'onDeviceConnected(callback: (device: DeviceInfoPayload, source: string) => void): Unsubscribe;'
    );
    const { report } = buildPhase1DriftReport(manifests, { preloadTypeSource }), payloadCheck = checkNamed(report, 'ipc manifest subscription public signatures match preload declaration signatures');
    expect(report.status).toBe('fail');
    expect(payloadCheck).toMatchObject({
      status: 'fail'
    });
    expect(payloadCheck.extra).toContain('device:connected (callback: (payload: DeviceInfoPayload) => void): Unsubscribe');
    expect(payloadCheck.missing).toContain('device:connected unknown');
  });
  it('fails when subscription methods expose extra parameters beyond callback', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    const preloadTypeSource = preloadTypeStub(
      'onDeviceConnected(callback: (device: DeviceInfoPayload) => void, once?: boolean): Unsubscribe;'
    );
    const { report } = buildPhase1DriftReport(manifests, { preloadTypeSource }), payloadCheck = checkNamed(report, 'ipc manifest subscription public signatures match preload declaration signatures');
    expect(report.status).toBe('fail');
    expect(payloadCheck).toMatchObject({
      status: 'fail'
    });
    expect(payloadCheck.extra).toContain('device:connected (callback: (payload: DeviceInfoPayload) => void): Unsubscribe');
    expect(payloadCheck.missing).toContain('device:connected unknown');
  });
  it('fails when void subscriptions declare a callback payload parameter', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    manifests.ipc.namespaces[0].subscriptions[0].payload = 'void';
    const preloadTypeSource = preloadTypeStub(
      'onDeviceConnected(callback: (payload: void) => void): Unsubscribe;'
    );
    const { report } = buildPhase1DriftReport(manifests, { preloadTypeSource });
    const payloadCheck = checkNamed(report, 'ipc manifest subscription public signatures match preload declaration signatures');
    expect(report.status).toBe('fail');
    expect(payloadCheck).toMatchObject({
      status: 'fail'
    });
    expect(payloadCheck.extra).toContain('device:connected (callback: () => void): Unsubscribe');
    expect(payloadCheck.missing).toContain('device:connected unknown');
  });
  it('fails when manifest preload exposure surfaces contain duplicate entries', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    manifests.ipc.namespaces[0].exposedMethods.push(manifests.ipc.namespaces[0].exposedMethods[0]);
    const { report } = buildPhase1DriftReport(manifests);
    const duplicateCheck = checkNamed(report, 'ipc manifest preload exposure entries are unique');
    expect(report.status).toBe('fail');
    expect(duplicateCheck).toMatchObject({
      status: 'fail',
      extra: ['deviceAPI.getDeviceStatus']
    });
  });
  it('fails when manifest exposed methods are not owned by invoke or subscription entries', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    manifests.ipc.namespaces[0].exposedMethods.push('orphanMethod');
    const { report } = buildPhase1DriftReport(manifests);
    const ownershipCheck = checkNamed(report, 'ipc manifest exposed methods are owned by exactly one invoke or subscription entry');
    expect(report.status).toBe('fail');
    expect(ownershipCheck).toMatchObject({
      status: 'fail',
      missing: ['deviceAPI.orphanMethod']
    });
  });
  it('fails when manifest handler metadata is missing', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    delete manifests.ipc.namespaces[0].invoke[0].handler;
    const { report } = buildPhase1DriftReport(manifests);
    const metadataCheck = checkNamed(report, 'ipc manifest handler metadata is explicit');
    expect(report.status).toBe('fail');
    expect(metadataCheck).toMatchObject({ status: 'fail', missing: ['device:get-status'] });
  });
  it('uses factoryMethod as the public preload key for ownership, signatures, and declaration generation', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    const windowNamespace = manifests.ipc.namespaces.find((entry) => entry.apiName === 'windowAPI');
    windowNamespace.invoke[0].method = 'setFullscreenInternal';
    windowNamespace.invoke[0].factoryMethod = 'setFullScreen';
    windowNamespace.subscriptions[2].method = 'onResizedInternal';
    windowNamespace.subscriptions[2].factoryMethod = 'onResized';
    const declaration = createPreloadDeclarationPreview(manifests.ipc);
    const { report } = buildPhase1DriftReport(manifests, { preloadTypeSource: declaration });
    expect(declaration).toContain('setFullScreen(enabled: boolean): Promise<WindowSetFullscreenResponse>;');
    expect(declaration).toContain('onResized(callback: () => void): Unsubscribe;');
    expect(declaration).not.toContain('setFullScreen(...args: unknown[]): unknown;');
    expect(declaration).not.toContain('onResized(...args: unknown[]): unknown;');
    expect(report.status).toBe('pass');
    expect(checkNamed(report, 'ipc manifest exposed methods are owned by exactly one invoke or subscription entry')).toMatchObject({ status: 'pass' });
    expect(checkNamed(report, 'ipc manifest invoke public signatures match preload declaration signatures')).toMatchObject({ status: 'pass' });
    expect(checkNamed(report, 'ipc manifest subscription public signatures match preload declaration signatures')).toMatchObject({ status: 'pass' });
  });
  it('fails when preload declarations expose methods not owned by the manifest', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    const preloadTypeSource = preloadTypeStub(
      'getDeviceStatus(): Promise<DeviceStatusPayload>; orphanDeclaration(): Promise<DeviceStatusPayload>;'
    );
    const { report } = buildPhase1DriftReport(manifests, { preloadTypeSource });
    const declarationCheck = checkNamed(report, 'preload declarations expose only manifest-owned methods');
    expect(report.status).toBe('fail');
    expect(declarationCheck.extra).toContain('deviceAPI.orphanDeclaration');
  });
  it('fails when preload declarations expose function properties not owned by the manifest', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    const preloadTypeSource = preloadTypeStub(
      'getDeviceStatus(): Promise<DeviceStatusPayload>; orphanDeclaration: () => Promise<DeviceStatusPayload>;'
    );
    const { report } = buildPhase1DriftReport(manifests, { preloadTypeSource });
    const declarationCheck = checkNamed(report, 'preload declarations expose only manifest-owned methods');
    expect(report.status).toBe('fail');
    expect(declarationCheck.extra).toContain('deviceAPI.orphanDeclaration');
  });
  it('fails when preload global API declarations drift from manifest globals', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    const preloadTypeSource = [
      'interface MetricsAPI { getProcessMetrics(): Promise<ProcessMetricsResponse>; }',
      'interface Window { metricsAPI?: MetricsAPI; }',
      'declare global { var metricsAPI: WindowIsFullscreenResponse | undefined; }'
    ].join(' ');
    const { report } = buildPhase1DriftReport(manifests, { preloadTypeSource });
    const globalCheck = checkNamed(report, 'preload global declarations match manifest API globals');
    expect(report.status).toBe('fail');
    expect(globalCheck.missing).toContain('metricsAPI MetricsAPI | undefined');
    expect(globalCheck.extra).toContain('metricsAPI WindowIsFullscreenResponse | undefined');
  });
  it('fails when preload global API vars are declared outside declare global', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    const preloadTypeSource = [
      'interface MetricsAPI { getProcessMetrics(): Promise<ProcessMetricsResponse>; }',
      'interface Window { metricsAPI?: MetricsAPI; }',
      'declare var metricsAPI: MetricsAPI | undefined;'
    ].join(' ');
    const { report } = buildPhase1DriftReport(manifests, { preloadTypeSource });
    const globalCheck = checkNamed(report, 'preload global declarations match manifest API globals');
    expect(report.status).toBe('fail');
    expect(globalCheck.missing).toContain('metricsAPI MetricsAPI | undefined');
    expect(globalCheck.extra).not.toContain('metricsAPI MetricsAPI | undefined');
  });
  it('fails when Window API declarations are required instead of optional', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    const preloadTypeSource = [
      'interface MetricsAPI { getProcessMetrics(): Promise<ProcessMetricsResponse>; }',
      'interface Window { metricsAPI: MetricsAPI; }',
      'declare global { var metricsAPI: MetricsAPI | undefined; }'
    ].join(' ');
    const { report } = buildPhase1DriftReport(manifests, { preloadTypeSource });
    const windowCheck = checkNamed(report, 'preload window API declarations match manifest globals');
    expect(report.status).toBe('fail');
    expect(windowCheck.missing).toContain('metricsAPI?: MetricsAPI');
    expect(windowCheck.extra).toContain('metricsAPI: MetricsAPI');
  });
  it('fails when the generated preload declaration references missing contract exports', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    manifests.ipc.namespaces[0].invoke[0].response = 'MissingPayloadType';
    const { report } = buildPhase1DriftReport(manifests);
    const typecheck = checkNamed(report, 'preload declaration generated preview typechecks');
    expect(report.status).toBe('fail');
    expect(typecheck.status).toBe('fail');
    expect(typecheck.actual).toContain('MissingPayloadType');
  });
  it('fails when manifest invoke ownership drifts by duplicate cardinality', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    manifests.ipc.namespaces[0].invoke.push({
      ...manifests.ipc.namespaces[0].invoke[0]
    });
    const { report } = buildPhase1DriftReport(manifests);
    const ownershipCheck = checkNamed(report, 'ipc manifest exposed methods are owned by exactly one invoke or subscription entry');
    expect(report.status).toBe('fail');
    expect(ownershipCheck).toMatchObject({
      status: 'fail',
      extra: ['deviceAPI.getDeviceStatus']
    });
  });
  it('fails when preload payload validator metadata drifts from manifest subscriptions', () => {
    const source = replaceOnce(fs.readFileSync('src/preload/validators.ts', 'utf8'), "UpdateProgressPayload: { validatePayload: isValidProgress, invalidPayloadLabel: 'progress' },", "UpdateProgressPayload: { validatePayload: isValidProgress, invalidPayloadLabel: 'download' },");
    expect(checkNamed(buildPhase1DriftReport(loadManifests(), { preloadValidatorsSource: source }).report, 'preload payload validator metadata matches ipc manifest subscriptions')).toMatchObject({ status: 'fail', extra: ['generated block drift'] });
  });
  it('generates declaration and docs fragments from manifests', () => {
    const manifests = loadManifests();
    const declaration = createPreloadDeclarationPreview(manifests.ipc);
    const eventChannels = createEventChannelsPreview(manifests.events);
    const eventPayloadMap = createEventPayloadMapBlock(manifests.events);
    const docs = createDocsFragment(manifests);
    const featureMap = createFeatureMapGeneratedBlock(manifests);
    expect(declaration).toContain('interface Window');
    expect(declaration).toContain('deviceAPI?:');
    expect(declaration).toContain('transcodeAPI?:');
    expect(declaration).toContain('getDeviceStatus(): Promise<DeviceStatusPayload>;');
    expect(declaration).toContain('openExternal(url: string): Promise<ShellOpenExternalResponse>;');
    expect(declaration).toContain('setFullScreen(enabled: boolean): Promise<WindowSetFullscreenResponse>;');
    expect(declaration).toContain('start(inputBuffer: ArrayBuffer, format: TranscodeFormat, outputFilename?: string, options?: TranscodeStartOptions): Promise<TranscodeStartResponse>;');
    expect(declaration).toContain('cancel(jobId: string): Promise<TranscodeCancelResponse>;');
    expect(declaration).toContain('onDeviceConnected(callback: (payload: DeviceInfoPayload) => void): Unsubscribe;');
    expect(declaration).toContain('onEnterFullscreen(callback: () => void): Unsubscribe;');
    expect(declaration).toContain('interface MetricsAPI');
    expect(declaration).toContain('var metricsAPI: MetricsAPI | undefined;');
    expect(declaration).not.toContain('...args: unknown[]');
    expect(eventChannels).toBe(fs.readFileSync('src/shared/events/event-channels.ts', 'utf8'));
    expect(eventChannels).toContain("SCREENSHOT_REQUESTED: getRendererChannel('ui', 'screenshot-requested'),");
    expect(fs.readFileSync('src/shared/events/event-payloads.ts', 'utf8')).toContain(eventPayloadMap);
    expect(eventPayloadMap).toContain('[EventChannels.SYSTEM.HANDLER_ERROR]: HandlerErrorPayload;');
    expect(fs.readFileSync('src/renderer/infrastructure/services/preload-event-bridge.factory.ts', 'utf8')).toContain(createRendererPreloadBridgeDescriptorPreview(manifests.ipc));
    expect(buildPhase1DriftReport(manifests, { preloadTypeSource: declaration }).report.status).toBe('pass');
    expect(docs).toContain('CODEBASE_PHASE1_MANIFESTS:START');
    expect(docs).toContain('| IPC namespaces | 8 |');
    expect(docs).toContain('| Platform targets | 5 |');
    expect(featureMap).toContain('CODEBASE_FEATURE_MAP:START');
    expect(featureMap).toContain('aliases: `@`, `@main`, `@renderer`');
    expect(featureMap).toContain('Mod Retro Chromatic (`0x374e:0x0101`, 160x144');
    expect(featureMap).toContain('`recordingFormat` -> `settingRecordingFormat`');
  });
  it('derives startup preferences from settings definition metadata', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    const startupPreferences = manifests.settings.definitions
      .filter((definition) => definition.startupPreference === true)
      .map((definition) => definition.name);
    manifests.settings.loadAllPreferencesShape = ['launchOnLogin'];
    const featureMap = createFeatureMapGeneratedBlock(manifests);
    const expectedStartupPreferences = startupPreferences.map((name) => `\`${name}\``).join(', ');
    expect(featureMap).toContain(`| Startup preferences | ${expectedStartupPreferences} |`);
    expect(featureMap).not.toContain('| Startup preferences | `launchOnLogin` |');
  });
  it('extracts arbitrary Vite/Vitest alias keys from direct objects and shared bindings', () => {
    const source = `
      const sharedAlias = {
        '@': '/src',
        '@shared': '/src/shared',
        ['@computed']: '/src/computed'
      };
      export default defineConfig({
        resolve: { alias: { ...sharedAlias, '@extra': '/src/extra', url: 'url/' } },
        test: { alias: sharedAlias }
      });
    `;
    expect(extractAliasKeysFromConfigSource(source, 'vitest.config.js')).toEqual([
      '@',
      '@computed',
      '@extra',
      '@shared',
      'url'
    ]);
  });
});
