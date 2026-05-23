import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function readProjectJson(relativePath) {
  return JSON.parse(readProjectFile(relativePath));
}

describe('Phase 0-6 CI parity gates', () => {
  it('keeps the compact implementation status tied to current quality gates', () => {
    const implementationPlan = readProjectFile('CODEBASE_SIZE_REDUCTION_IMPLEMENTATION_PLAN.md');

    expect(implementationPlan).toContain('Current audit note');
    expect(implementationPlan).toContain('npm run codebase:size -- --enforce-thresholds');
    expect(implementationPlan).toContain('npm run codebase:phase1 -- --json');
    expect(implementationPlan).toContain('npm run architecture:scorecard -- --enforce-thresholds');
    expect(implementationPlan).toContain('npm run lint');
    expect(implementationPlan).toContain('npm run architecture:type-debt:check');
    expect(implementationPlan).toContain('root `npm run typecheck`');
    expect(implementationPlan).toContain('Historical verification detail is intentionally summarized');
  });

  it('keeps GitHub Actions wired to the same PR lint, scorecard, and packaging ABI commands used by phase testing', () => {
    const lintWorkflow = readProjectFile('.github/workflows/reusable-ci-lint.yml');
    const testWorkflow = readProjectFile('.github/workflows/reusable-ci-tests.yml');
    const buildSmokeWorkflow = readProjectFile('.github/workflows/reusable-ci-build-smoke.yml');
    const desktopBuildWorkflow = readProjectFile('.github/workflows/reusable-build-desktop.yml');

    expect(lintWorkflow).toContain('amannn/action-semantic-pull-request');
    expect(lintWorkflow).toContain('npx commitlint --from');
    expect(lintWorkflow).toContain('--to');
    expect(testWorkflow).toContain('npm run architecture:scorecard -- --enforce-thresholds');
    expect(testWorkflow).toContain('npm run codebase:phase1 -- --json');
    expect(testWorkflow).toContain('artifacts/architecture-scorecard.json');
    expect(testWorkflow).toContain('artifacts/architecture-scorecard-summary.md');
    expect(testWorkflow).toContain('npm run coverage:ratchet');
    expect(testWorkflow).toContain('xvfb-run -a npm run dev:smoke');
    expect(testWorkflow).toContain('npm run packaging:check-native-abi');
    expect(buildSmokeWorkflow).toContain('npm run packaging:check-native-abi');
    expect(desktopBuildWorkflow).toContain('npm run packaging:check-native-abi');
  });

  it('builds fresh Vite output before the default E2E gate launches Electron', () => {
    const packageJson = readProjectJson('package.json');

    expect(packageJson.scripts['test:e2e']).toBe('npm run build:vite && npm run test:e2e:built');
    expect(packageJson.scripts['test:e2e:built']).toBe('playwright test');
    expect(packageJson.scripts['test:e2e:ui']).toContain('npm run build:vite && playwright test --ui');
    expect(packageJson.scripts['test:e2e:headed']).toContain('npm run build:vite && playwright test --headed');
    expect(packageJson.scripts['test:e2e:debug']).toContain('npm run build:vite && playwright test --debug');
    expect(readProjectFile('tests/e2e/fixtures/electron.fixture.js')).toContain(
      "path.join(projectRoot, 'dist/main/index.js')"
    );
  });

  it('keeps repeated E2E settings and stream flows behind page-object fixtures', () => {
    const fixtureSource = readProjectFile('tests/e2e/fixtures/electron.fixture.js');
    const appLaunchSource = readProjectFile('tests/e2e/app-launch.spec.js');
    const deviceConnectionSource = readProjectFile('tests/e2e/device-connection.spec.js');
    const deviceStreamingSource = readProjectFile('tests/e2e/device-streaming.spec.js');
    const fullscreenSource = readProjectFile('tests/e2e/fullscreen.spec.js');
    const settingsSpecSource = readProjectFile('tests/e2e/settings.spec.js');
    const streamingSmokeSource = readProjectFile('tests/e2e/streaming-smoke.spec.js');

    [
      'tests/e2e/pages/app-shell.page.js',
      'tests/e2e/pages/settings.page.js',
      'tests/e2e/pages/stream.page.js',
      'tests/e2e/fixtures/chromatic-device.fixture.js',
      'tests/e2e/helpers/device-ipc.helper.js'
    ].forEach((relativePath) => {
      expect(fs.existsSync(path.join(projectRoot, relativePath))).toBe(true);
    });

    expect(fixtureSource).toContain('new AppShellPage(window)');
    expect(fixtureSource).toContain('new SettingsMenuPage(window)');
    expect(fixtureSource).toContain('new StreamPage(window)');
    expect(fixtureSource).toContain('new ChromaticDeviceFixture(electronApp, window)');
    expect(settingsSpecSource).toContain("from './pages/settings.page.js'");
    expect(settingsSpecSource).toContain('settingsMenu');
    expect(settingsSpecSource).toContain('SettingsTestControls.toggleableBooleanControls');
    expect(settingsSpecSource).not.toContain('function expectPopupVisible');
    expect(settingsSpecSource).not.toContain("toggleBoolean('statusStrip')");
    expect(settingsSpecSource).not.toContain("locator('#settingsBtn')");
    expect(settingsSpecSource).not.toContain("locator('#settingsMenuContainer')");
    expect(appLaunchSource).toContain('settingsMenu');
    expect(appLaunchSource).toContain('appShell');
    expect(appLaunchSource).toContain('SettingsTestControls.toggleableBooleanControls');
    expect(appLaunchSource).not.toMatch(/import\s+\{[^}]*waitForAppReady/);
    expect(appLaunchSource).not.toMatch(/await waitForAppReady\(/);
    expect(appLaunchSource).not.toContain('function expectPopupVisible');
    expect(appLaunchSource).not.toContain("locator('#settingsBtn')");
    expect(appLaunchSource).not.toContain("locator('#settingsMenuContainer')");
    expect(appLaunchSource).not.toContain("locator('#fullscreenBtn')");
    expect(appLaunchSource).not.toContain("locator('#statusIndicator')");
    expect(appLaunchSource).not.toContain("locator('#statusText')");
    expect(appLaunchSource).not.toContain("locator('#deviceStatus')");
    expect(deviceConnectionSource).toContain('appShell');
    expect(deviceConnectionSource).toContain('settingsMenu');
    expect(deviceConnectionSource).toContain('streamPage');
    expect(deviceConnectionSource).not.toContain('waitForAppReady');
    expect(deviceConnectionSource).not.toContain("locator('#settingsBtn')");
    expect(deviceConnectionSource).not.toContain("locator('#streamCanvas')");
    expect(deviceStreamingSource).toContain('appShell');
    expect(deviceStreamingSource).toContain('chromaticDevice');
    expect(deviceStreamingSource).toContain('chromaticDevice.fixture');
    expect(deviceStreamingSource).toContain('streamPage');
    expect(deviceStreamingSource).toContain('SettingsTestControls.toggleableBooleanControls');
    expect(deviceStreamingSource).not.toMatch(/import\s+\{[^}]*waitForAppReady/);
    expect(deviceStreamingSource).not.toMatch(/await waitForAppReady\(/);
    expect(deviceStreamingSource).not.toContain('window.locator(');
    expect(deviceStreamingSource).not.toContain('injectMockChromaticDevice');
    expect(deviceStreamingSource).not.toContain('cleanupMockDevice');
    expect(deviceStreamingSource).not.toContain('CHROMATIC_SPECS');
    expect(deviceStreamingSource).not.toContain('setMockDeviceStatus');
    expect(deviceStreamingSource).not.toContain('injectDeviceConnectedEvent');
    expect(deviceStreamingSource).not.toContain('clearMockDeviceStatus');
    expect(fullscreenSource).toContain('appShell');
    expect(fullscreenSource).toContain('streamPage');
    expect(fullscreenSource).not.toContain('waitForAppReady');
    expect(fullscreenSource).not.toContain("locator('#fullscreenBtn')");
    expect(fullscreenSource).not.toContain("locator('#fullscreenControls')");
    expect(fullscreenSource).not.toContain("locator('#fsExitBtn')");
    expect(fullscreenSource).not.toContain("locator('#streamCanvas')");
    expect(streamingSmokeSource).toContain('streamPage');
    expect(streamingSmokeSource).toContain('chromaticDevice');
    expect(streamingSmokeSource).not.toContain('function startStreaming');
    expect(streamingSmokeSource).not.toContain('function connectMockChromatic');
    expect(streamingSmokeSource).not.toContain("locator('#streamCanvas')");
    expect(streamingSmokeSource).not.toContain("locator('#shaderBtn')");
  });
});
