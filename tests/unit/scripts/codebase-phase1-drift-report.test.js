import { describe, expect, it } from 'vitest';
import {
  buildPhase1DriftReport,
  createDocsFragment,
  createFeatureMapGeneratedBlock,
  createPreloadDeclarationPreview,
  loadManifests
} from '../../../scripts/codebase-phase1-drift-report.js';
import { extractAliasKeysFromConfigSource } from '../../../scripts/lib/alias-config.js';

const preloadTypeStub = (deviceMethod) => `interface DeviceAPI { ${deviceMethod} } interface Window { deviceAPI?: DeviceAPI; }`;
const checkNamed = (report, name) => report.checks.find((check) => check.name === name);

describe('codebase phase 1 drift report', () => {
  it('passes against the current manifest-owned surfaces', () => {
    const { report } = buildPhase1DriftReport();

    expect(report.status).toBe('pass');
    expect(report.checks.map((check) => check.name)).toContain('ipc manifest preload exposure entries are unique');
    expect(report.checks.map((check) => check.name)).toContain(
      'ipc manifest exposed methods are owned by exactly one invoke or subscription entry'
    );
    expect(report.checks.map((check) => check.name)).toContain('preload declarations expose only manifest-owned methods');
    expect(report.checks.map((check) => check.name)).toContain('ipc channels manifest matches channels.json');
    expect(report.checks.map((check) => check.name)).toContain('preload index delegates exposure shape to manifest factory');
    expect(report.checks.map((check) => check.name)).toContain(
      'ipc manifest invoke public signatures match preload declaration signatures'
    );
    expect(report.checks.map((check) => check.name)).toContain(
      'ipc manifest subscription public signatures match preload declaration signatures'
    );
    expect(report.checks.map((check) => check.name)).toContain('preload global declarations match manifest API globals');
    expect(report.checks.map((check) => check.name)).toContain('platform manifest labels match release build matrix');
    expect(report.checks.map((check) => check.name)).toContain('render pass manifest owns uniform upload metadata');
    expect(
      report.checks.find((check) => check.name === 'architecture aliases cover tsconfig.base aliases')
    ).toMatchObject({
      expectedCount: 6,
      actualCount: 6
    });
  });

  it('fails when an intentional manifest mismatch is introduced', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    manifests.ipc.namespaces[0].invoke[0].channel = 'device:get-status-drifted';

    const { report } = buildPhase1DriftReport(manifests);
    const ipcCheck = report.checks.find((check) => check.name === 'ipc channels manifest matches channels.json');

    expect(report.status).toBe('fail');
    expect(ipcCheck).toMatchObject({
      status: 'fail',
      missing: ['device:get-status'],
      extra: ['device:get-status-drifted']
    });
  });

  it('fails when the IPC manifest authority mode is downgraded', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    manifests.ipc.mode = 'report-only';

    const { report } = buildPhase1DriftReport(manifests);
    expect(checkNamed(report, 'ipc manifest is enforced')).toMatchObject({
      status: 'fail',
      actual: 'report-only',
      missing: ['mode=enforced']
    });
  });

  it('fails when an invoke response schema drifts from preload declarations', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    manifests.ipc.namespaces[0].invoke[0].response = 'WindowIsFullscreenResponse';

    const { report } = buildPhase1DriftReport(manifests);
    const responseCheck = checkNamed(report, 'ipc manifest invoke public signatures match preload declaration signatures');

    expect(report.status).toBe('fail');
    expect(responseCheck).toMatchObject({
      status: 'fail',
      missing: ['device:get-status (): Promise<DeviceStatusPayload>'],
      extra: ['device:get-status (): Promise<WindowIsFullscreenResponse>']
    });
  });

  it('fails when preload declaration invoke arguments drift from manifest signatures', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    const preloadTypeSource = 'interface ShellAPI { openExternal(): Promise<ShellOpenExternalResponse>; } interface Window { shellAPI?: ShellAPI; }';

    const { report } = buildPhase1DriftReport(manifests, { preloadTypeSource });
    const responseCheck = checkNamed(report, 'ipc manifest invoke public signatures match preload declaration signatures');

    expect(report.status).toBe('fail');
    expect(responseCheck.missing).toContain('shell:open-external (): Promise<ShellOpenExternalResponse>');
    expect(responseCheck.extra).toContain('shell:open-external (url: string): Promise<ShellOpenExternalResponse>');
  });

  it('fails when preload declaration invoke argument types drift from manifest signatures', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    const preloadTypeSource = 'interface WindowAPI { setFullScreen(enabled: string): Promise<WindowSetFullscreenResponse>; } interface Window { windowAPI?: WindowAPI; }';

    const { report } = buildPhase1DriftReport(manifests, { preloadTypeSource });
    const responseCheck = checkNamed(report, 'ipc manifest invoke public signatures match preload declaration signatures');

    expect(report.status).toBe('fail');
    expect(responseCheck.missing).toContain('window:set-fullscreen (enabled: string): Promise<WindowSetFullscreenResponse>');
    expect(responseCheck.extra).toContain('window:set-fullscreen (enabled: boolean): Promise<WindowSetFullscreenResponse>');
  });

  it('fails when preload declaration invoke methods stop returning promises', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    const preloadTypeSource = preloadTypeStub('getDeviceStatus(): DeviceStatusPayload;');

    const { report } = buildPhase1DriftReport(manifests, { preloadTypeSource });
    const responseCheck = checkNamed(report, 'ipc manifest invoke public signatures match preload declaration signatures');

    expect(report.status).toBe('fail');
    expect(responseCheck.extra).toContain('device:get-status (): Promise<DeviceStatusPayload>');
    expect(responseCheck.missing).toContain('device:get-status (): DeviceStatusPayload');
  });

  it('fails when manifest-owned invoke methods have overloaded preload declarations', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    const preloadTypeSource = preloadTypeStub(
      'getDeviceStatus(): DeviceStatusPayload; getDeviceStatus(): Promise<DeviceStatusPayload>;'
    );

    const { report } = buildPhase1DriftReport(manifests, { preloadTypeSource });
    const responseCheck = checkNamed(report, 'ipc manifest invoke public signatures match preload declaration signatures');

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

    const { report } = buildPhase1DriftReport(manifests, { preloadTypeSource });
    const responseCheck = checkNamed(report, 'ipc manifest invoke public signatures match preload declaration signatures');

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

    const { report } = buildPhase1DriftReport(manifests, { preloadTypeSources });
    const responseCheck = checkNamed(report, 'ipc manifest invoke public signatures match preload declaration signatures');

    expect(report.status).toBe('fail');
    expect(responseCheck.extra).toContain('device:get-status (): Promise<DeviceStatusPayload>');
    expect(responseCheck.missing).toContain('device:get-status declaration-count:2 compatible-count:1');
  });

  it('fails when a subscription payload schema drifts from preload declarations', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    manifests.ipc.namespaces[0].subscriptions[0].payload = 'void';

    const { report } = buildPhase1DriftReport(manifests);
    const payloadCheck = checkNamed(report, 'ipc manifest subscription public signatures match preload declaration signatures');

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

    const { report } = buildPhase1DriftReport(manifests, { preloadTypeSource });
    const payloadCheck = checkNamed(report, 'ipc manifest subscription public signatures match preload declaration signatures');

    expect(report.status).toBe('fail');
    expect(payloadCheck.missing).toContain('device:connected (callback: (payload: DeviceInfoPayload) => void): void');
    expect(payloadCheck.extra).toContain('device:connected (callback: (payload: DeviceInfoPayload) => void): Unsubscribe');
  });

  it('fails when subscription callback return types drift from manifest signatures', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    const preloadTypeSource = preloadTypeStub(
      'onDeviceConnected(callback: (device: DeviceInfoPayload) => Promise<void>): Unsubscribe;'
    );

    const { report } = buildPhase1DriftReport(manifests, { preloadTypeSource });
    const payloadCheck = checkNamed(report, 'ipc manifest subscription public signatures match preload declaration signatures');

    expect(report.status).toBe('fail');
    expect(payloadCheck.missing).toContain('device:connected (callback: (payload: DeviceInfoPayload) => Promise<void>): Unsubscribe');
    expect(payloadCheck.extra).toContain('device:connected (callback: (payload: DeviceInfoPayload) => void): Unsubscribe');
  });

  it('fails when subscription callbacks declare unsupported payload arity', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    const preloadTypeSource = preloadTypeStub(
      'onDeviceConnected(callback: (device: DeviceInfoPayload, source: string) => void): Unsubscribe;'
    );

    const { report } = buildPhase1DriftReport(manifests, { preloadTypeSource });
    const payloadCheck = checkNamed(report, 'ipc manifest subscription public signatures match preload declaration signatures');

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

    const { report } = buildPhase1DriftReport(manifests, { preloadTypeSource });
    const payloadCheck = checkNamed(report, 'ipc manifest subscription public signatures match preload declaration signatures');

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
    const duplicateCheck = report.checks.find(
      (check) => check.name === 'ipc manifest preload exposure entries are unique'
    );

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

  it('fails when compared IPC schema surfaces drift by duplicate cardinality', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    manifests.ipc.namespaces[0].invoke.push({
      ...manifests.ipc.namespaces[0].invoke[0]
    });

    const { report } = buildPhase1DriftReport(manifests);
    const requestCheck = checkNamed(report, 'ipc manifest request schemas match main handler descriptors');

    expect(report.status).toBe('fail');
    expect(requestCheck).toMatchObject({
      status: 'fail',
      extra: ['device:get-status []']
    });
  });

  it('generates declaration and docs fragments from manifests', () => {
    const manifests = loadManifests();
    const declaration = createPreloadDeclarationPreview(manifests.ipc);
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
    expect(buildPhase1DriftReport(manifests, { preloadTypeSource: declaration }).report.status).toBe('pass');
    expect(docs).toContain('CODEBASE_PHASE1_MANIFESTS:START');
    expect(docs).toContain('| IPC namespaces | 8 |');
    expect(docs).toContain('| Platform targets | 5 |');
    expect(featureMap).toContain('CODEBASE_FEATURE_MAP:START');
    expect(featureMap).toContain('aliases: `@`, `@main`, `@renderer`');
    expect(featureMap).toContain('Mod Retro Chromatic (`0x374e:0x0101`, 160x144');
    expect(featureMap).toContain('`recordingFormat` -> `settingRecordingFormat`');
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
