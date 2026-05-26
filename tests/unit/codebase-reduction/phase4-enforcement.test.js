import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createPreloadExposureMap } from '@preload/exposure.factory.js';
import { IpcContractManifest } from '@shared/ipc/ipc.manifest.js';
import { BUILD_OUTPUT_PATHS, GENERATED_PATHS } from '../../../scripts/clean-generated.js';

const projectRoot = process.cwd();
const assignmentOperator = String.raw`(?:=(?!=|>)|\|\|=|&&=|\?\?=|\+=|-=|\*=|\/=|%=|\+\+|--)`;

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function readProjectJson(relativePath) {
  return JSON.parse(readProjectFile(relativePath));
}

function projectPath(relativePath) {
  return path.join(projectRoot, relativePath);
}

function expectMissing(relativePath) {
  expect(fs.existsSync(projectPath(relativePath))).toBe(false);
}

function expectContainsAll(source, values) {
  values.forEach((value) => expect(source).toContain(value));
}

function expectExcludesAll(source, values) {
  values.forEach((value) => {
    if (value instanceof RegExp) {
      expect(source).not.toMatch(value);
      return;
    }
    expect(source).not.toContain(value);
  });
}

function collectFiles(relativeDirectory, predicate, files = []) {
  for (const entry of fs.readdirSync(projectPath(relativeDirectory), { withFileTypes: true })) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      collectFiles(relativePath, predicate, files);
      continue;
    }

    if (entry.isFile() && predicate(relativePath)) {
      files.push(relativePath);
    }
  }

  return files;
}

function createManifestPreloadApiImplementations(manifest = IpcContractManifest) {
  return Object.fromEntries(
    manifest.namespaces.map((namespace) => [
      namespace.apiName,
      Object.fromEntries(
        namespace.exposedMethods.map((methodName) => [methodName, () => undefined])
      )
    ])
  );
}

describe('Phase 4 clean-break enforcement', () => {
  it('records Phase 4 as delivered work and keeps canonical test factories on ESM imports', () => {
    const implementationPlan = readProjectFile('CODEBASE_SIZE_REDUCTION_IMPLEMENTATION_PLAN.md');
    const factoryIndex = readProjectFile('tests/factories/index.js');

    expect(implementationPlan).toContain('Historical phase delivery summary');
    expect(implementationPlan).toContain('Phase 4-6 added scorecard enforcement');
    expect(implementationPlan).toContain('Historical verification detail is intentionally summarized');
    expect(implementationPlan).not.toContain('Next phase when resumed: Phase 4');
    expect(factoryIndex).not.toMatch(/\brequire\(/);
  });

  it('keeps HideTimer retirement protected by explicit file and reference guards', () => {
    expectMissing('src/renderer/presentation/primitives/hide-timer.class.js');
    expectMissing('tests/unit/ui/primitives/hide-timer.test.js');

    const forbiddenPatterns = [
      { label: 'HideTimer identifier reference', pattern: /\bHideTimer\b/ },
      { label: 'hide-timer module/path reference', pattern: /hide-timer/ }
    ];
    const violations = [];
    const candidateFiles = [
      ...collectFiles('src', (relativePath) => /\.[cm]?[jt]sx?$/.test(relativePath)),
      ...[
        'tests/unit/ui',
        'tests/unit/features/notes/ui',
        'tests/unit/renderer/presentation/primitives'
      ].flatMap((root) => collectFiles(root, (relativePath) => /\.[cm]?[jt]sx?$/.test(relativePath)))
    ];

    candidateFiles.forEach((relativePath) => {
      const source = readProjectFile(relativePath);
      forbiddenPatterns.forEach(({ label, pattern }) => {
        if (pattern.test(source)) {
          violations.push(`${relativePath}: ${label}`);
        }
      });
    });

    expect(violations).toEqual([]);
  });

  it('keeps remaining browser API test globals behind explicit installers', () => {
    expectMissing('tests/mocks/webgl-context.mock.js');

    const installerSource = readProjectFile('tests/support/mocks/browser-api.installers.js');
    const testMockIndexSource = readProjectFile('tests/mocks/index.js');

    expect(testMockIndexSource).not.toContain('installWebGLMock');
    expect(testMockIndexSource).not.toContain('webgl-context.mock');

    [
      'installAnimationFrameMock',
      'installBlobMock',
      'installBlobDownloadMock',
      'installClipboardMock',
      'installCreateImageBitmapMock',
      'installDevicePixelRatioMock',
      'installDocumentCreateElementMock',
      'installDocumentPropertyMock',
      'installFullscreenDocumentMock',
      'installGetComputedStyleMock',
      'installLocalStorageMock',
      'installMatchMediaMock',
      'installMediaRecorderMock',
      'installMediaMocks',
      'installMissingMutationObserverMock',
      'installMissingWindowMock',
      'installNavigatorMock',
      'installResizeObserverMock',
      'installWorkerMock',
      'installWorkerScopeMock',
      'installWindowPropertyMock'
    ].forEach((installerName) => {
      expect(installerSource).toContain(installerName);
    });

    const forbiddenPatterns = [
      { label: 'global URL assignment', pattern: new RegExp(String.raw`\bglobal(?:This)?\s*(?:\.\s*URL|\[\s*['"]URL['"]\s*\])\s*${assignmentOperator}`) },
      { label: 'global URL delete', pattern: /\bdelete\s+global(?:This)?\s*(?:\.\s*URL|\[\s*['"]URL['"]\s*\])/ },
      { label: 'global Blob assignment', pattern: new RegExp(String.raw`\bglobal(?:This)?\s*(?:\.\s*Blob|\[\s*['"]Blob['"]\s*\])\s*${assignmentOperator}`) },
      { label: 'global MediaRecorder assignment', pattern: new RegExp(String.raw`\bglobal(?:This)?\s*(?:\.\s*MediaRecorder|\[\s*['"]MediaRecorder['"]\s*\])\s*${assignmentOperator}`) },
      { label: 'global MediaRecorder static assignment', pattern: new RegExp(String.raw`\bglobal(?:This)?\s*(?:\.\s*MediaRecorder|\[\s*['"]MediaRecorder['"]\s*\])\s*(?:\.\s*isTypeSupported|\[\s*['"]isTypeSupported['"]\s*\])\s*${assignmentOperator}`) },
      { label: 'RAF global spy', pattern: /\bvi\.spyOn\(\s*global(?:This)?\s*,\s*['"](requestAnimationFrame|cancelAnimationFrame)['"]/ },
      { label: 'Worker global assignment', pattern: new RegExp(String.raw`\bglobal(?:This)?\s*(?:\.\s*Worker|\[\s*['"]Worker['"]\s*\])\s*${assignmentOperator}`) },
      { label: 'Worker vi.stubGlobal', pattern: /\bvi\.stubGlobal\(['"]Worker['"]/ },
      { label: 'createImageBitmap global assignment', pattern: new RegExp(String.raw`\bglobal(?:This)?\s*(?:\.\s*createImageBitmap|\[\s*['"]createImageBitmap['"]\s*\])\s*${assignmentOperator}`) },
      { label: 'createImageBitmap vi.stubGlobal', pattern: /\bvi\.stubGlobal\(['"]createImageBitmap['"]/ },
      { label: 'ResizeObserver global assignment', pattern: new RegExp(String.raw`\bglobal(?:This)?\s*(?:\.\s*ResizeObserver|\[\s*['"]ResizeObserver['"]\s*\])\s*${assignmentOperator}`) },
      { label: 'ResizeObserver global delete', pattern: /\bdelete\s+global(?:This)?\s*(?:\.\s*ResizeObserver|\[\s*['"]ResizeObserver['"]\s*\])/ },
      { label: 'ResizeObserver vi.stubGlobal', pattern: /\bvi\.stubGlobal\(['"]ResizeObserver['"]/ },
      { label: 'window.URL.createObjectURL assignment', pattern: new RegExp(String.raw`\bwindow\s*(?:\.\s*URL|\[\s*['"]URL['"]\s*\])\s*(?:\.\s*createObjectURL|\[\s*['"]createObjectURL['"]\s*\])\s*${assignmentOperator}`) },
      { label: 'window.URL.revokeObjectURL assignment', pattern: new RegExp(String.raw`\bwindow\s*(?:\.\s*URL|\[\s*['"]URL['"]\s*\])\s*(?:\.\s*revokeObjectURL|\[\s*['"]revokeObjectURL['"]\s*\])\s*${assignmentOperator}`) },
      { label: 'devicePixelRatio vi.stubGlobal', pattern: /\bvi\.stubGlobal\(['"]devicePixelRatio['"]/ },
      { label: 'window.getComputedStyle assignment', pattern: new RegExp(String.raw`\b(?:global(?:This)?\s*\.\s*)?window\s*(?:\.\s*getComputedStyle|\[\s*['"]getComputedStyle['"]\s*\])\s*${assignmentOperator}`) },
      { label: 'window.matchMedia assignment', pattern: new RegExp(String.raw`\b(?:global(?:This)?\s*\.\s*)?window\s*(?:\.\s*matchMedia|\[\s*['"]matchMedia['"]\s*\])\s*${assignmentOperator}`) },
      { label: 'MutationObserver delete', pattern: /\bdelete\s+global(?:This)?\s*(?:\.\s*MutationObserver|\[\s*['"]MutationObserver['"]\s*\])/ },
      { label: 'MutationObserver assignment', pattern: new RegExp(String.raw`\bglobal(?:This)?\s*(?:\.\s*MutationObserver|\[\s*['"]MutationObserver['"]\s*\])\s*${assignmentOperator}`) }
    ];

    ['globalThis ["URL"] = MockURL;', 'globalThis["Blob"] ||= MockBlob;', 'globalThis["MediaRecorder"] ["isTypeSupported"] = vi.fn();', 'window ["URL"] ["createObjectURL"] = vi.fn();', 'globalThis . URL = MockURL;', 'globalThis . MediaRecorder . isTypeSupported = vi.fn();', 'window . URL . createObjectURL = vi.fn();'].forEach((source) => expect(forbiddenPatterns.some(({ pattern }) => pattern.test(source)), source).toBe(true));

    const violations = [];
    collectFiles('tests', (relativePath) => /\.[cm]?[jt]s$/.test(relativePath))
      .filter((relativePath) => relativePath !== 'tests/support/mocks/browser-api.installers.js' && !relativePath.startsWith('tests/unit/codebase-reduction/'))
      .forEach((relativePath) => {
        const source = readProjectFile(relativePath);
        forbiddenPatterns.forEach(({ label, pattern }) => {
          if (pattern.test(source)) {
            violations.push(`${relativePath}: ${label}`);
          }
        });
      });

    expect(violations).toEqual([]);

    const canvasPrototypeViolations = [];
    collectFiles('tests', (relativePath) => /\.[cm]?[jt]s$/.test(relativePath))
      .filter((relativePath) => relativePath !== 'tests/support/mocks/browser-api.installers.js')
      .forEach((relativePath) => {
        const source = readProjectFile(relativePath);
        [
          { label: 'HTMLCanvasElement prototype method assignment', pattern: /\bHTMLCanvasElement\.prototype(?:\.(getContext|toBlob|toDataURL)|\[['"](getContext|toBlob|toDataURL)['"]\])\s*=/ },
          { label: 'HTMLCanvasElement descriptor mutation', pattern: /\bObject\.definePropert(?:y|ies)\(\s*HTMLCanvasElement\.prototype\s*,/ }
        ].forEach(({ label, pattern }) => {
          if (pattern.test(source)) {
            canvasPrototypeViolations.push(`${relativePath}: ${label}`);
          }
        });
      });

    expect(canvasPrototypeViolations).toEqual([]);

    const browserPropertyViolations = [];
    const browserPropertyMutationPatterns = [
      { label: 'direct document/window defineProperty', pattern: /\b(?:Object|Reflect)\.defineProperty\(\s*(document|window)\s*,\s*['"](hidden|fullscreenElement|innerWidth|innerHeight)['"]/ },
      { label: 'direct document/window defineProperties', pattern: /\bObject\.defineProperties\(\s*(document|window)\s*,\s*\{[\s\S]{0,800}(?:['"]?(hidden|fullscreenElement|innerWidth|innerHeight)['"]?|\[['"](hidden|fullscreenElement|innerWidth|innerHeight)['"]\])\s*:/ }
    ];
    collectFiles('tests', (relativePath) => /\.[cm]?[jt]s$/.test(relativePath))
      .filter((relativePath) => relativePath !== 'tests/support/mocks/browser-api.installers.js')
      .forEach((relativePath) => {
        const source = readProjectFile(relativePath);
        browserPropertyMutationPatterns.forEach(({ label, pattern }) => {
          if (pattern.test(source)) {
            browserPropertyViolations.push(`${relativePath}: ${label}`);
          }
        });
      });

    expect(browserPropertyViolations).toEqual([]);

    const mediaDevicesMutationViolations = [];
    const mediaDevicesMutationPatterns = [
      {
        label: 'navigator.mediaDevices method assignment',
        pattern: /\b(?:global(?:This)?\.|window\.)?navigator\.mediaDevices(?:\.(enumerateDevices|getUserMedia|addEventListener|removeEventListener)|\[['"](enumerateDevices|getUserMedia|addEventListener|removeEventListener)['"]\])\s*=/
      },
      {
        label: 'navigator.mediaDevices descriptor mutation',
        pattern: /\b(?:Object|Reflect)\.defineProperty\(\s*(?:global(?:This)?\.|window\.)?navigator\.mediaDevices\s*,\s*['"](enumerateDevices|getUserMedia|addEventListener|removeEventListener)['"]/
      },
      {
        label: 'navigator.mediaDevices defineProperties',
        pattern: /\bObject\.defineProperties\(\s*(?:global(?:This)?\.|window\.)?navigator\.mediaDevices\s*,\s*\{[\s\S]{0,800}(?:['"]?(enumerateDevices|getUserMedia|addEventListener|removeEventListener)['"]?|\[['"](enumerateDevices|getUserMedia|addEventListener|removeEventListener)['"]\])\s*:/
      }
    ];
    collectFiles('tests', (relativePath) => /\.[cm]?[jt]s$/.test(relativePath))
      .filter((relativePath) => {
        return relativePath !== 'tests/support/mocks/browser-api.installers.js'
          && !relativePath.startsWith('tests/e2e/')
          && !relativePath.startsWith('tests/unit/codebase-reduction/');
      })
      .forEach((relativePath) => {
        const source = readProjectFile(relativePath);
        mediaDevicesMutationPatterns.forEach(({ label, pattern }) => {
          if (pattern.test(source)) {
            mediaDevicesMutationViolations.push(`${relativePath}: ${label}`);
          }
        });
      });

    expect(mediaDevicesMutationViolations).toEqual([]);

    const clipboardMutationViolations = [];
    const clipboardMutationPatterns = [
      {
        label: 'navigator.clipboard assignment',
        pattern: /\b(?:global(?:This)?\.|window\.)?navigator(?:\.clipboard|\[['"]clipboard['"]\])\s*=/
      },
      {
        label: 'navigator clipboard Reflect.set',
        pattern: /\bReflect\.set\(\s*(?:global(?:This)?\.|window\.)?navigator\s*,\s*['"]clipboard['"]/
      },
      {
        label: 'navigator clipboard descriptor mutation',
        pattern: /\b(?:Object|Reflect)\.defineProperty\(\s*(?:global(?:This)?\.|window\.)?navigator\s*,\s*['"]clipboard['"]/
      },
      {
        label: 'navigator clipboard defineProperties',
        pattern: /\bObject\.defineProperties\(\s*(?:global(?:This)?\.|window\.)?navigator\s*,\s*\{[\s\S]{0,800}(?:['"]?clipboard['"]?|\[['"]clipboard['"]\])\s*:/
      }
    ];
    collectFiles('tests', (relativePath) => /\.[cm]?[jt]s$/.test(relativePath))
      .filter((relativePath) => {
        return relativePath !== 'tests/support/mocks/browser-api.installers.js'
          && !relativePath.startsWith('tests/e2e/')
          && !relativePath.startsWith('tests/unit/codebase-reduction/');
      })
      .forEach((relativePath) => {
        const source = readProjectFile(relativePath);
        clipboardMutationPatterns.forEach(({ label, pattern }) => {
          if (pattern.test(source)) {
            clipboardMutationViolations.push(`${relativePath}: ${label}`);
          }
        });
      });

    expect(clipboardMutationViolations).toEqual([]);

    const workerScopeViolations = [];
    const workerScopeMutationPatterns = [
      {
        label: 'worker self global assignment',
        pattern: /\bglobal(?:This)?(?:\.self|\[['"]self['"]\])\s*=/
      },
      {
        label: 'worker self Reflect.set',
        pattern: /\bReflect\.set\(\s*global(?:This)?\s*,\s*['"]self['"]/
      },
      {
        label: 'worker self vi.stubGlobal',
        pattern: /\bvi\.stubGlobal\(['"]self['"]/
      },
      {
        label: 'worker self descriptor mutation',
        pattern: /\b(?:Object|Reflect)\.defineProperty\(\s*global(?:This)?\s*,\s*['"]self['"]/
      },
      {
        label: 'worker self defineProperties',
        pattern: /\bObject\.defineProperties\(\s*global(?:This)?\s*,\s*\{[\s\S]{0,800}(?:['"]?self['"]?|\[['"]self['"]\])\s*:/
      }
    ];
    collectFiles('tests', (relativePath) => /\.[cm]?[jt]s$/.test(relativePath))
      .filter((relativePath) => {
        return relativePath !== 'tests/support/mocks/browser-api.installers.js'
          && !relativePath.startsWith('tests/e2e/')
          && !relativePath.startsWith('tests/unit/codebase-reduction/');
      })
      .forEach((relativePath) => {
        const source = readProjectFile(relativePath);
        workerScopeMutationPatterns.forEach(({ label, pattern }) => {
          if (pattern.test(source)) {
            workerScopeViolations.push(`${relativePath}: ${label}`);
          }
        });
      });

    expect(workerScopeViolations).toEqual([]);

    const browserInfrastructureForbiddenPatterns = [
      { label: 'global navigator assignment', pattern: /\bglobal\.navigator\s*=/ },
      { label: 'globalThis navigator assignment', pattern: /\bglobalThis\.navigator\s*=/ },
      { label: 'navigator vi.stubGlobal', pattern: /\bvi\.stubGlobal\(['"]navigator['"]/ },
      { label: 'global localStorage assignment', pattern: /\bglobal\.localStorage\s*=/ },
      { label: 'globalThis localStorage assignment', pattern: /\bglobalThis\.localStorage\s*=/ },
      { label: 'localStorage vi.stubGlobal', pattern: /\bvi\.stubGlobal\(['"]localStorage['"]/ },
      { label: 'localStorage method assignment', pattern: /\blocalStorage\.(getItem|setItem|removeItem|key)\s*=/ },
      { label: 'localStorage descriptor mutation', pattern: /\bObject\.defineProperty\(\s*localStorage\s*,/ }
    ];
    const browserInfrastructureViolations = [];
    collectFiles('tests/unit/renderer/infrastructure/browser', (relativePath) => /\.(test|spec)\.[jt]s$/.test(relativePath))
      .forEach((relativePath) => {
        const source = readProjectFile(relativePath);
        browserInfrastructureForbiddenPatterns.forEach(({ label, pattern }) => {
          if (pattern.test(source)) {
            browserInfrastructureViolations.push(`${relativePath}: ${label}`);
          }
        });
      });

    expect(browserInfrastructureViolations).toEqual([]);

    const settingsServiceForbiddenPatterns = [
      { label: 'global localStorage assignment', pattern: /\bglobal\.localStorage\s*=/ },
      { label: 'globalThis localStorage assignment', pattern: /\bglobalThis\.localStorage\s*=/ },
      { label: 'localStorage vi.stubGlobal', pattern: /\bvi\.stubGlobal\(['"]localStorage['"]/ }
    ];
    const settingsServiceViolations = [];
    collectFiles('tests/unit/features/settings/services', (relativePath) => /\.(test|spec)\.[jt]s$/.test(relativePath))
      .forEach((relativePath) => {
        const source = readProjectFile(relativePath);
        settingsServiceForbiddenPatterns.forEach(({ label, pattern }) => {
          if (pattern.test(source)) {
            settingsServiceViolations.push(`${relativePath}: ${label}`);
          }
        });
      });

    expect(settingsServiceViolations).toEqual([]);

    const settingsFullscreenForbiddenPatterns = [
      { label: 'global document assignment', pattern: /\bglobal\.document\s*=/ },
      { label: 'globalThis document assignment', pattern: /\bglobalThis\.document\s*=/ },
      { label: 'document vi.stubGlobal', pattern: /\bvi\.stubGlobal\(['"]document['"]/ }
    ];
    const settingsFullscreenViolations = [];
    const settingsFullscreenTest = 'tests/unit/features/settings/services/fullscreen.service.test.js';
    settingsFullscreenForbiddenPatterns.forEach(({ label, pattern }) => {
      if (pattern.test(readProjectFile(settingsFullscreenTest))) {
        settingsFullscreenViolations.push(`${settingsFullscreenTest}: ${label}`);
      }
    });

    expect(settingsFullscreenViolations).toEqual([]);

    const streamingAcquisitionForbiddenPatterns = [
      { label: 'global navigator assignment', pattern: /\bglobal\.navigator\s*=/ },
      { label: 'globalThis navigator assignment', pattern: /\bglobalThis\.navigator\s*=/ },
      { label: 'navigator vi.stubGlobal', pattern: /\bvi\.stubGlobal\(['"]navigator['"]/ }
    ];
    const streamingAcquisitionViolations = [];
    collectFiles('tests/unit/features/streaming/acquisition', (relativePath) => /\.(test|spec)\.[jt]s$/.test(relativePath))
      .forEach((relativePath) => {
        const source = readProjectFile(relativePath);
        streamingAcquisitionForbiddenPatterns.forEach(({ label, pattern }) => {
          if (pattern.test(source)) {
            streamingAcquisitionViolations.push(`${relativePath}: ${label}`);
          }
        });
      });

    expect(streamingAcquisitionViolations).toEqual([]);

    const streamingRenderingForbiddenPatterns = [
      { label: 'global window assignment', pattern: /\bglobal\.window\s*=/ },
      { label: 'global document assignment', pattern: /\bglobal\.document\s*=/ },
      { label: 'global window delete', pattern: /\bdelete\s+global\.window\b/ },
      { label: 'global document delete', pattern: /\bdelete\s+global\.document\b/ },
      { label: 'globalThis window assignment', pattern: /\bglobalThis\.window\s*=/ },
      { label: 'globalThis document assignment', pattern: /\bglobalThis\.document\s*=/ },
      { label: 'window vi.stubGlobal', pattern: /\bvi\.stubGlobal\(['"]window['"]/ },
      { label: 'document vi.stubGlobal', pattern: /\bvi\.stubGlobal\(['"]document['"]/ }
    ];
    const streamingRenderingViolations = [];
    collectFiles('tests/unit/features/streaming/rendering', (relativePath) => /\.(test|spec)\.[jt]s$/.test(relativePath))
      .forEach((relativePath) => {
        const source = readProjectFile(relativePath);
        streamingRenderingForbiddenPatterns.forEach(({ label, pattern }) => {
          if (pattern.test(source)) {
            streamingRenderingViolations.push(`${relativePath}: ${label}`);
          }
        });
      });

    expect(streamingRenderingViolations).toEqual([]);

    const deviceAdapterForbiddenPatterns = [
      { label: 'global window delete', pattern: /\bdelete\s+global\.window\b/ },
      { label: 'global window assignment', pattern: /\bglobal\.window\s*=/ },
      { label: 'globalThis window assignment', pattern: /\bglobalThis\.window\s*=/ },
      { label: 'window vi.stubGlobal', pattern: /\bvi\.stubGlobal\(['"]window['"]/ }
    ];
    const deviceAdapterViolations = [];
    collectFiles('tests/unit/features/devices/adapters', (relativePath) => /\.(test|spec)\.[jt]s$/.test(relativePath))
      .forEach((relativePath) => {
        const source = readProjectFile(relativePath);
        deviceAdapterForbiddenPatterns.forEach(({ label, pattern }) => {
          if (pattern.test(source)) {
            deviceAdapterViolations.push(`${relativePath}: ${label}`);
          }
        });
      });

    expect(deviceAdapterViolations).toEqual([]);

    const captureOrchestratorForbiddenPatterns = [
      { label: 'global window assignment', pattern: /\bglobal\.window\s*=/ },
      { label: 'global document assignment', pattern: /\bglobal\.document\s*=/ },
      { label: 'globalThis window assignment', pattern: /\bglobalThis\.window\s*=/ },
      { label: 'globalThis document assignment', pattern: /\bglobalThis\.document\s*=/ },
      { label: 'window vi.stubGlobal', pattern: /\bvi\.stubGlobal\(['"]window['"]/ },
      { label: 'document vi.stubGlobal', pattern: /\bvi\.stubGlobal\(['"]document['"]/ }
    ];
    const captureOrchestratorViolations = [];
    const captureOrchestratorTest = 'tests/unit/features/capture/services/capture.orchestrator.test.js';
    captureOrchestratorForbiddenPatterns.forEach(({ label, pattern }) => {
      if (pattern.test(readProjectFile(captureOrchestratorTest))) {
        captureOrchestratorViolations.push(`${captureOrchestratorTest}: ${label}`);
      }
    });

    expect(captureOrchestratorViolations).toEqual([]);

    const captureServiceForbiddenPatterns = [
      { label: 'global document assignment', pattern: /\bglobal\.document\s*=/ },
      { label: 'globalThis document assignment', pattern: /\bglobalThis\.document\s*=/ },
      { label: 'document vi.stubGlobal', pattern: /\bvi\.stubGlobal\(['"]document['"]/ }
    ];
    const captureServiceViolations = [];
    const captureServiceTest = 'tests/unit/features/capture/services/capture.service.test.js';
    captureServiceForbiddenPatterns.forEach(({ label, pattern }) => {
      if (pattern.test(readProjectFile(captureServiceTest))) {
        captureServiceViolations.push(`${captureServiceTest}: ${label}`);
      }
    });

    expect(captureServiceViolations).toEqual([]);

    const gpuRecordingForbiddenPatterns = [
      { label: 'global document assignment', pattern: /\bglobal\.document\s*=/ },
      { label: 'global requestAnimationFrame assignment', pattern: /\bglobal\.requestAnimationFrame\s*=/ },
      { label: 'global cancelAnimationFrame assignment', pattern: /\bglobal\.cancelAnimationFrame\s*=/ },
      { label: 'globalThis document assignment', pattern: /\bglobalThis\.document\s*=/ },
      { label: 'globalThis requestAnimationFrame assignment', pattern: /\bglobalThis\.requestAnimationFrame\s*=/ },
      { label: 'globalThis cancelAnimationFrame assignment', pattern: /\bglobalThis\.cancelAnimationFrame\s*=/ },
      { label: 'document vi.stubGlobal', pattern: /\bvi\.stubGlobal\(['"]document['"]/ },
      { label: 'requestAnimationFrame vi.stubGlobal', pattern: /\bvi\.stubGlobal\(['"]requestAnimationFrame['"]/ },
      { label: 'cancelAnimationFrame vi.stubGlobal', pattern: /\bvi\.stubGlobal\(['"]cancelAnimationFrame['"]/ }
    ];
    const gpuRecordingViolations = [];
    const gpuRecordingTest = 'tests/unit/features/capture/services/gpu-recording.service.test.js';
    gpuRecordingForbiddenPatterns.forEach(({ label, pattern }) => {
      if (pattern.test(readProjectFile(gpuRecordingTest))) {
        gpuRecordingViolations.push(`${gpuRecordingTest}: ${label}`);
      }
    });

    expect(gpuRecordingViolations).toEqual([]);

    const uiEffectsForbiddenPatterns = [
      { label: 'global document assignment', pattern: /\bglobal\.document\s*=/ },
      { label: 'globalThis document assignment', pattern: /\bglobalThis\.document\s*=/ },
      { label: 'document vi.stubGlobal', pattern: /\bvi\.stubGlobal\(['"]document['"]/ }
    ];
    const uiEffectsViolations = [];
    const uiEffectsTest = 'tests/unit/ui/effects.test.js';
    uiEffectsForbiddenPatterns.forEach(({ label, pattern }) => {
      if (pattern.test(readProjectFile(uiEffectsTest))) {
        uiEffectsViolations.push(`${uiEffectsTest}: ${label}`);
      }
    });

    expect(uiEffectsViolations).toEqual([]);
  });

  it('keeps Node process runtime test globals behind explicit installers', () => {
    expectMissing('tests/support/mocks/node-runtime.installers.js');
    const installerSource = readProjectFile('tests/support/mocks/runtime-property.installers.js');

    [
      'createCleanupStack',
      'installTargetProperty',
      'installProcessArgvMock',
      'installProcessEnvMock',
      'installProcessPlatformMock',
      'installProcessRuntimeMock'
    ].forEach((installerName) => {
      expect(installerSource).toContain(installerName);
    });

    const processRuntimeViolations = [];
    const stringLiteralQuote = '["\'`]';
    const processRuntimePropertyNames = String.raw`(?:platform|argv|env)`;
    const processRuntimeStringKey = String.raw`${stringLiteralQuote}${processRuntimePropertyNames}${stringLiteralQuote}`;
    const processEnvAccess = String.raw`process(?:\s*\.\s*env|\s*\[\s*${stringLiteralQuote}env${stringLiteralQuote}\s*\])`;
    const processArgvAccess = String.raw`process(?:\s*\.\s*argv|\s*\[\s*${stringLiteralQuote}argv${stringLiteralQuote}\s*\])`;
    const processRuntimePropertyAccess = String.raw`process(?:\s*\.\s*${processRuntimePropertyNames}|\s*\[\s*${processRuntimeStringKey}\s*\])`;
    const processRuntimeNestedTarget = String.raw`(?:${processEnvAccess}|${processArgvAccess})`;
    const processEnvKeyAccess = String.raw`${processEnvAccess}(?:\s*\.\s*[A-Za-z_$][\w$]*|\s*\[[^\]]+\])`;
    const processArgvItemAccess = String.raw`${processArgvAccess}\s*\[[^\]]+\]`;
    const processRuntimePrefixUpdate = String.raw`(?:\+\+|--)\s*`;
    const processPattern = (label, pattern) => ({ label, pattern: new RegExp(pattern) });
    const processRuntimeMutationPatterns = [
      processPattern('process platform, argv, or env assignment', String.raw`(?:\b${processRuntimePropertyAccess}\s*${assignmentOperator}|${processRuntimePrefixUpdate}${processRuntimePropertyAccess})`),
      processPattern('process env key assignment', String.raw`(?:\b${processEnvKeyAccess}\s*${assignmentOperator}|${processRuntimePrefixUpdate}${processEnvKeyAccess})`),
      processPattern('process argv item assignment', String.raw`(?:\b${processArgvItemAccess}\s*${assignmentOperator}|${processRuntimePrefixUpdate}${processArgvItemAccess})`),
      processPattern('process platform, argv, or env delete', String.raw`\bdelete\s+${processRuntimePropertyAccess}`),
      processPattern('process env key delete', String.raw`\bdelete\s+${processEnvKeyAccess}`),
      processPattern('process argv item delete', String.raw`\bdelete\s+${processArgvItemAccess}`),
      processPattern('process argv mutating method', String.raw`\b${processArgvAccess}(?:\s*\.\s*(?:copyWithin|fill|pop|push|reverse|shift|sort|splice|unshift)|\s*\[\s*${stringLiteralQuote}(?:copyWithin|fill|pop|push|reverse|shift|sort|splice|unshift)${stringLiteralQuote}\s*\])\s*\(`),
      processPattern('process platform, argv, or env descriptor mutation', String.raw`\b(?:Object|Reflect)\.defineProperty\(\s*(?:process\s*,\s*${processRuntimeStringKey}|${processRuntimeNestedTarget}\s*,)`),
      processPattern('process env object mutation', String.raw`\bObject\.assign\(\s*${processRuntimeNestedTarget}\s*,`),
      processPattern('process platform, argv, or env defineProperties', String.raw`\bObject\.defineProperties\(\s*(?:process\s*,\s*\{[\s\S]{0,800}(?:${processRuntimePropertyNames}|${processRuntimeStringKey}|\[\s*${processRuntimeStringKey}\s*\])\s*:|${processRuntimeNestedTarget}\s*,)`),
      processPattern('process platform, argv, or env Reflect.set', String.raw`\bReflect\.set\(\s*(?:process\s*,\s*${processRuntimeStringKey}|${processRuntimeNestedTarget}\s*,)`),
      processPattern('process platform, argv, or env Reflect.deleteProperty', String.raw`\bReflect\.deleteProperty\(\s*(?:process\s*,\s*${processRuntimeStringKey}|${processRuntimeNestedTarget}\s*,)`),
      {
        label: 'process vi.stubGlobal',
        pattern: /\bvi\.stubGlobal\(['"]process['"]/
      },
      processPattern('process installTargetProperty bypass', String.raw`\binstallTargetProperty\(\s*(?:process\s*,\s*${processRuntimeStringKey}|${processRuntimeNestedTarget}\s*,)`)
    ];

    [
      "process['env'].NODE_ENV = 'test';", 'process["env"]["NODE_ENV"] = "test";',
      'process[`env`].NODE_ENV = "test";', "process['argv'][0] = 'node';",
      'process["argv"].push("--flag");', "Object.defineProperty(process['env'], 'NODE_ENV', { value: 'test' });",
      'Object.defineProperties(process, { ["env"]: { value: {} } });', 'Object.defineProperties(process["argv"], { 0: { value: "node" } });', "Reflect.set(process['argv'], '0', 'node');",
      'delete process.env;', "delete process['argv'][0];", "Reflect.deleteProperty(process, 'env');", "Reflect.deleteProperty(process['env'], 'NODE_ENV');",
      "installTargetProperty(process.env, 'NODE_ENV', 'test');", "installTargetProperty(process['argv'], '0', 'node');"
    ].forEach((source) => {
      expect(
        processRuntimeMutationPatterns.some(({ pattern }) => pattern.test(source)),
        source
      ).toBe(true);
    });

    collectFiles('tests', (relativePath) => /\.[cm]?[jt]s$/.test(relativePath))
      .filter((relativePath) => {
        return relativePath !== 'tests/support/mocks/runtime-property.installers.js'
          && !relativePath.startsWith('tests/unit/codebase-reduction/');
      })
      .forEach((relativePath) => {
        const source = readProjectFile(relativePath);
        processRuntimeMutationPatterns.forEach(({ label, pattern }) => {
          if (pattern.test(source)) {
            processRuntimeViolations.push(`${relativePath}: ${label}`);
          }
        });
      });

    expect(processRuntimeViolations).toEqual([]);
  });

  it('keeps preload API globals behind descriptor-restoring handles', () => {
    const preloadGlobalsSource = readProjectFile('tests/support/mocks/preload-api-globals.js');
    const preloadApiPattern = IpcContractManifest.namespaces.map((namespace) => namespace.apiName).join('|');
    const duplicateIpcRendererFactories = collectFiles('tests', (relativePath) => /\.[cm]?[jt]s$/.test(relativePath))
      .filter((relativePath) => relativePath !== 'tests/support/mocks/preload-api-globals.js')
      .filter((relativePath) => /\b(function|const|let|var)\s+createMockIpcRenderer\b/.test(readProjectFile(relativePath)));

    expectContainsAll(preloadGlobalsSource, ['activePreloadApiHandles', "installTargetProperty } from './runtime-property.installers.js'"]);
    expect(duplicateIpcRendererFactories).toEqual([]);
    expect(preloadGlobalsSource).not.toMatch(/\bObject\.defineProperty\(|\bReflect\.deleteProperty\(/);
    expectExcludesAll(preloadGlobalsSource, [
      new RegExp(`\\b(?:globalThis|window|globalThis\\.window)\\.(?:${preloadApiPattern})\\s*=`),
      new RegExp(`\\bdelete\\s+(?:globalThis|window|globalThis\\.window)\\.(?:${preloadApiPattern})\\b`),
      /\bglobalThis\.window\s*=/,
      /\b(?:windowObject|window|globalThis\.window)\[[^\]]+\]\s*=/,
      /\bglobalThis\[[^\]]+\]\s*=/,
      /\bReflect\.set\(\s*(globalThis|windowObject|window|globalThis\.window)\s*,\s*name\b/,
      /\bReflect\.deleteProperty\(\s*(globalThis|windowObject|window|globalThis\.window)\s*,\s*name\b/,
      /\bObject\.defineProperty\(\s*(globalThis|windowObject|window|globalThis\.window)\s*,\s*name\b/,
      /\bObject\.assign\(\s*(globalThis|windowObject|window|globalThis\.window)\s*,\s*\{[\s\S]{0,400}\[name\]\s*:/,
      new RegExp(`\\bObject\\.assign\\(\\s*(?:globalThis|window|globalThis\\.window)\\s*,\\s*\\{[\\s\\S]{0,400}(?:${preloadApiPattern})\\s*:`),
      /\bdelete\s+(?:globalThis(?:\.window)?|window)\[[^\]]+\]/
    ]);
  });

  it('keeps document body installer failures from leaking createElement patches', async () => {
    const { installDocumentCreateElementMock } = await import('../../support/mocks/browser-api.installers.js');
    const { installTargetProperty } = await import('../../support/mocks/runtime-property.installers.js');
    const originalCreateElement = vi.fn();
    const documentTarget = {
      createElement: originalCreateElement
    };
    const appendChild = vi.fn();
    const documentHandle = installTargetProperty(globalThis, 'document', documentTarget);

    try {
      expect(() => installDocumentCreateElementMock({
        body: null,
        createElement: vi.fn(),
        appendChild
      })).toThrow('Cannot install document.body mock without document.body');
      expect(documentTarget.createElement).toBe(originalCreateElement);
    } finally {
      documentHandle.cleanup();
    }
  });

  it('keeps generated artifact ownership on current ignored paths without legacy coverage cleanup', () => {
    const gitignore = readProjectFile('.gitignore');
    const sizeReport = readProjectFile('scripts/codebase-size-report.js');
    const packageJson = readProjectJson('package.json');

    expectContainsAll(GENERATED_PATHS, ['artifacts/coverage']);
    expectExcludesAll(GENERATED_PATHS, ['tests/coverage']);
    expect(GENERATED_PATHS).not.toEqual(expect.arrayContaining(BUILD_OUTPUT_PATHS));
    expect(BUILD_OUTPUT_PATHS).toEqual(['dist', 'release', 'build', 'out']);
    expectContainsAll(gitignore, ['artifacts/']);
    expectExcludesAll(gitignore, ['tests/coverage/']);
    expectExcludesAll(sizeReport, ["'tests/coverage'"]);
    expect(packageJson.scripts['clean:generated']).toBe('node scripts/clean-generated.js');
    expect(packageJson.scripts['clean:build']).toBe('node scripts/clean-generated.js --build');
  });

  it('keeps phase-1 manifest ownership checks tied to generated feature-map and platform facts', () => {
    const featureMap = readProjectFile('docs/feature-map.md');
    const buildMatrix = readProjectFile('scripts/ci/build-matrix.mjs');
    const smokeTest = readProjectFile('scripts/smoke-test.js');
    const phase1Drift = readProjectFile('scripts/codebase-phase1-drift-report.js');

    expectContainsAll(featureMap, ['CODEBASE_FEATURE_MAP:START', 'CODEBASE_FEATURE_MAP:END', 'Architecture paths', 'Settings UI']);
    expectContainsAll(buildMatrix, ['platforms.manifest.json', 'manifest.platformGroups', 'manifest.smokeInputAliases']);
    expectContainsAll(smokeTest, ['platforms.manifest.json', 'smokeExecutablePriority']);
    expectContainsAll(phase1Drift, [
      'feature map generated manifest block is current',
      'createFeatureMapGeneratedBlock',
      'build matrix derives platform entries from platform manifest',
      'smoke test executable discovery derives from platform manifest'
    ]);
    expectExcludesAll(buildMatrix, ['linuxX64', /const entries\s*=\s*\{/]);
    expectExcludesAll(smokeTest, ['linux-unpacked', 'mac-arm64', 'win-unpacked']);
  });

  it('enforces every Phase 4 architecture ownership ratchet', () => {
    const thresholds = readProjectJson('scripts/architecture-thresholds.json');

    expect(thresholds.mode).toBe('enforce');
    expect(thresholds.limits).toMatchObject({
      unexpectedContractFileCountMax: 0,
      shaderDuplicateDivergenceCountMax: 0,
      shaderDuplicateFileCountMax: 0,
      runtimeJsDtsTwinCountMax: 0,
      sourceRuntimeJsFileCountMax: 0,
      hideTimerRetirementViolationCountMax: 0,
      sharedBaseInterfaceJsOrDtsFileCountMax: 0,
      inlineCanonicalMockAssignmentCountMax: 0,
      rendererBackendImplementationViolationCountMax: 0,
      renderPassManifestOwnershipViolationCountMax: 0,
      aliasManifestDriftCountMax: 0,
      platformManifestDriftCountMax: 0
    });
  });

  it('keeps type and coverage debt ratchets owned and expiring', () => {
    const typeDebt = readProjectJson('scripts/type-debt-allowlist.json');
    const coverageThresholds = readProjectJson('scripts/coverage-thresholds.json');
    const sizeThresholds = readProjectJson('scripts/codebase-size-thresholds.json');
    const tsconfigApp = readProjectJson('tsconfig.app.json');
    const packageJson = readProjectJson('package.json');

    expect(typeDebt.defaultOwner).toBeTruthy();
    expect(typeDebt.defaultExpiresOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeDebt.entries.every((entry) => entry.expiresOn)).toBe(true);
    expect(coverageThresholds.mode).toBe('enforce');
    expect(coverageThresholds.targets.every((target) => target.owner && target.expiresOn)).toBe(true);
    expect(sizeThresholds.mode).toBe('enforce');
    expect(sizeThresholds.baseline.scopes).toEqual([
      'src/main',
      'src/renderer',
      'src/preload',
      'src/shared',
      'packages/prismgb-gpu/src'
    ]);
    expect(sizeThresholds.limits.runtimeSourceNetGrowthMax).toBe(0);
    expect(sizeThresholds.limits.trackedFilesTotalMax).toBe(686);
    expect(tsconfigApp.include).toContain('src/preload/**/*.ts');
    expect(packageJson.scripts['release:preflight']).toContain('codebase:size -- --enforce-thresholds');
  });

  it('keeps asset typings and migrated registries free of legacy compatibility aliases', () => {
    expect(fs.existsSync(projectPath('src/types/legacy-js-modules.d.ts'))).toBe(false);
    expect(fs.existsSync(projectPath('src/types/asset-modules.d.ts'))).toBe(true);
    const deviceRegistrySource = readProjectFile('src/shared/features/devices/device.registry.ts');
    const typedRegistrySource = readProjectFile('src/shared/registry/typed-registry.factory.ts');

    const assetModules = readProjectFile('src/types/asset-modules.d.ts');

    expect(assetModules).toContain("declare module '*.svg?raw'");
    expect(assetModules).not.toMatch(/legacy|compat/i);
    expect(deviceRegistrySource).not.toMatch(/\bDEVICE_REGISTRY\b/);
    expect(typedRegistrySource).not.toMatch(/getValueMap|getMetadataMap|getFactoryMap/);
  });

  it('keeps built-in shader preset data centralized without per-preset modules', () => {
    [
      'packages/prismgb-gpu/src/domain/presets/presets/hi-def.preset.ts',
      'packages/prismgb-gpu/src/domain/presets/presets/performance.preset.ts',
      'packages/prismgb-gpu/src/domain/presets/presets/pixel.preset.ts',
      'packages/prismgb-gpu/src/domain/presets/presets/true-color.preset.ts',
      'packages/prismgb-gpu/src/domain/presets/presets/vibrant.preset.ts',
      'packages/prismgb-gpu/src/domain/presets/presets/vintage.preset.ts'
    ].forEach(expectMissing);

    const presetDefinitions = readProjectFile('packages/prismgb-gpu/src/domain/presets/preset-definitions.ts');
    const gpuEntry = readProjectFile('packages/prismgb-gpu/src/index.ts');
    const rendererContainer = readProjectFile('src/renderer/application/container.ts');
    const rawSettingsDefinitions = readProjectJson('src/shared/features/settings/settings.definitions.json');
    const renderPresetDefinition = rawSettingsDefinitions.definitions.find(
      (definition) => definition.name === 'renderPreset'
    );

    expect(presetDefinitions).toContain('BUILT_IN_PRESETS');
    expect(presetDefinitions).toContain('PRESET_POLICY');
    expect(presetDefinitions).toContain("rendererDefaultId: 'vibrant'");
    expect(presetDefinitions).toContain("id: 'true-color'");
    expect(presetDefinitions).toContain("id: 'performance'");
    expect(presetDefinitions).toContain('visibleInUI: performancePreset.id !== PRESET_POLICY.performancePresetId');
    expect(presetDefinitions).not.toContain("from './presets/");
    expect(gpuEntry).toContain('PresetRegistry.registerMany(BUILT_IN_PRESETS)');
    expect(rendererContainer).toContain('PresetRegistry.setDefault(PRESET_POLICY.rendererDefaultId)');
    expect(rendererContainer).not.toContain("PresetRegistry.setDefault('vibrant')");
    expect(renderPresetDefinition).toMatchObject({
      name: 'renderPreset',
      defaultSource: 'PRESET_POLICY.rendererDefaultId'
    });
    expect(renderPresetDefinition).not.toHaveProperty('default');
  });

  it('keeps renderer worker protocol-only and package-owned', () => {
    const workerSource = readProjectFile('src/renderer/infrastructure/rendering/workers/render.worker.ts');

    expect(workerSource).toContain("from '@prismgb/gpu'");
    expect(workerSource).toContain('createWorkerPipeline');
    expect(workerSource).not.toMatch(/webgpu-renderer\.engine|webgl2-renderer\.engine|optimization\.utils/);

    const renderWorkerImports = [...workerSource.matchAll(/import\s+.*?from\s+['"]([^'"]+)['"]/g)]
      .map((match) => match[1]);
    const nonProtocolRelativeImports = renderWorkerImports.filter((source) =>
      source.startsWith('./') && source !== './worker-protocol.config.js'
    );

    expect(nonProtocolRelativeImports).toEqual([]);
  });

  it('keeps Canvas2D fallback drawing package-owned', () => {
    const renderLoopSource = readProjectFile('src/renderer/infrastructure/services/streaming/canvas-render-loop.service.ts');

    expect(fs.existsSync(path.join(projectRoot, 'src/renderer/infrastructure/services/streaming/canvas-renderer.ts'))).toBe(false);
    expect(renderLoopSource).toContain("from '@prismgb/gpu'");
    expect(renderLoopSource).toContain('createPipeline');
    expect(renderLoopSource).toContain("preferredAPI: 'canvas2d'");
    expect(renderLoopSource).not.toMatch(/\.getContext\(|\.drawImage\(|imageSmoothingEnabled|CanvasRenderingContext2D/);
  });

  it('keeps stale test contracts and duplicate E2E device mocks deleted', () => {
    [
      'tests/contracts/event-contracts.js',
      'tests/contracts/index.js',
      'tests/e2e/helpers/ipc-mock.js',
      'tests/e2e/mocks/mock-chromatic-device.js',
      'tests/e2e/mocks/index.js'
    ].forEach(expectMissing);

    const electronFixture = readProjectFile('tests/e2e/fixtures/electron.fixture.js');
    const deviceIpcHelper = readProjectFile('tests/e2e/helpers/device-ipc.helper.js');
    const chromaticHelper = readProjectFile('tests/e2e/helpers/mock-chromatic.helper.js');
    const chromaticSupport = readProjectFile('tests/support/chromatic-device-specs.js');
    const mockDevice = readProjectFile('tests/mocks/MockDevice.js');

    expectContainsAll(electronFixture, ["from '../helpers/device-ipc.helper.js'"]);
    expectContainsAll(deviceIpcHelper, ["from '../../support/ipc-channels.js'"]);
    expectExcludesAll(electronFixture, [/const IPC_CHANNELS\s*=\s*\{/]);
    expectExcludesAll(deviceIpcHelper, [/const IPC_CHANNELS\s*=\s*\{/]);
    expectContainsAll(chromaticHelper, ["from '../../support/chromatic-device-specs.js'", 'CHROMATIC_E2E_FIXTURE', '{ fixture: CHROMATIC_E2E_FIXTURE']);
    expectContainsAll(chromaticSupport, ['CHROMATIC_E2E_FIXTURE', 'CHROMATIC_DEVICE_MANIFEST_ENTRY.fixture']);
    expectContainsAll(mockDevice, ["from '../support/chromatic-device-specs.js'"]);
  });

  it('keeps preload exposures and E2E device mocks on current manifest-owned contracts', () => {
    const preloadIndex = readProjectFile('src/preload/index.ts');
    const preloadExposureFactory = readProjectFile('src/preload/exposure.factory.ts');
    const chromaticHelper = readProjectFile('tests/e2e/helpers/mock-chromatic.helper.js');
    const deviceStreamingSpec = readProjectFile('tests/e2e/device-streaming.spec.js');
    const fullscreenSpec = readProjectFile('tests/e2e/fullscreen.spec.js');
    const exposureMap = createPreloadExposureMap(createManifestPreloadApiImplementations());

    expect(preloadIndex).toContain("from '@preload/exposure.factory.js'");
    expect(preloadIndex).toContain('exposePreloadApis(contextBridge');
    expect(preloadIndex).not.toMatch(/contextBridge\.exposeInMainWorld\('[^']+',\s*\{/);
    expect(Object.keys(exposureMap)).toEqual(
      IpcContractManifest.namespaces.map((namespace) => namespace.apiName)
    );
    for (const namespace of IpcContractManifest.namespaces) {
      expect(Object.keys(exposureMap[namespace.apiName])).toEqual(namespace.exposedMethods);
    }
    expect(preloadExposureFactory).toContain("from '@shared/ipc/ipc.manifest.json'");
    expect(preloadExposureFactory).toContain('manifest.namespaces.map');
    expect(preloadExposureFactory).toContain('namespace.exposedMethods.map');

    expect(chromaticHelper).not.toMatch(/connectedCallbacks|disconnectedCallbacks/);
    expect(chromaticHelper).not.toContain('Trigger deviceAPI callbacks');
    expect(deviceStreamingSpec).toContain('chromaticDevice.fixture');
    expect(deviceStreamingSpec).not.toMatch(/CHROMATIC_SPECS|injectMockChromaticDevice|cleanupMockDevice/);
    expect(deviceStreamingSpec).not.toContain("toBe('Chromatic')");
    expect(deviceStreamingSpec).not.toContain("toBe('Chromatic Audio')");
    expect(fullscreenSpec).toContain('CHROMATIC_E2E_FIXTURE.display.aspectRatio');
    expect(fullscreenSpec).not.toContain('160 / 144');
    expect(deviceStreamingSpec).not.toContain('deviceAPI callback tests are skipped');
  });

  it('keeps Phase 6 shader source ownership discovered from package shader directories', () => {
    [
      'packages/prismgb-gpu/src/infrastructure/webgpu/webgpu-shader-loader.ts',
      'packages/prismgb-gpu/src/infrastructure/webgl2/webgl2-shader-loader.ts'
    ].forEach((relativePath) => {
      const loaderSource = readProjectFile(relativePath);

      expect(loaderSource).toContain('import.meta.glob');
      expect(loaderSource).not.toMatch(/import\s+\w+\s+from\s+['"]\.\/shaders\/[^'"]+\?raw['"]/);
      expect(loaderSource).not.toMatch(/['"][^'"]+\.(?:wgsl|glsl)['"]\s*:/);
    });
  });

  it('keeps presentation icons discovered by glob instead of manual imports', () => {
    const iconUtils = readProjectFile('src/renderer/presentation/icons/icon.utils.ts');

    expect(iconUtils).toContain('import.meta.glob');
    expect(iconUtils).toContain("query: '?raw'");
    expect(iconUtils).not.toMatch(/import\s+\w+\s+from\s+['"][^'"]+\.svg\?raw['"]/);
  });

  it('keeps presentation icon assets and getIconSvg callers in lockstep', () => {
    const iconAssets = fs.readdirSync(projectPath('src/renderer/assets/icons'))
      .filter((filename) => filename.endsWith('.svg'))
      .map((filename) => filename.replace(/\.svg$/, ''))
      .sort();
    const iconCallPattern = /getIconSvg\(\s*['"]([^'"]+)['"]/g;
    const usedIcons = new Set();

    collectFiles(
      'src/renderer/presentation',
      (relativePath) => /\.(?:js|ts)$/.test(relativePath) && relativePath !== 'src/renderer/presentation/icons/icon.utils.ts'
    ).forEach((relativePath) => {
      for (const match of readProjectFile(relativePath).matchAll(iconCallPattern)) {
        usedIcons.add(match[1]);
      }
    });

    expect([...usedIcons].sort()).toEqual(iconAssets);
  });

  it('keeps settings menu controls and recording format options derived from settings definitions', () => {
    const settingsTemplate = readProjectFile('src/renderer/presentation/features/settings/settings-menu.template.ts');

    expectContainsAll(settingsTemplate, [
      'SettingsDefinitions.definitions.find',
      'createSettingsControlsTemplate',
      'definition.ui?.controlId',
      'getRecordingFormatOptions'
    ]);
    expectExcludesAll(settingsTemplate, [
      /id="setting(?:LaunchOnLogin|StatusStrip|FullscreenOnStartup|AutoStreamOnConnect|MinimalistFullscreen|AnimationSaver|RecordingFormat)"/,
      'Show Status Bar',
      'Auto-start stream',
      /data-value="(?:webm|mp4|mov)"/
    ]);
  });

  it('uses streaming-mode as the single streaming body-state contract', () => {
    [
      'src/renderer/presentation/effects/body-class.class.ts',
      'src/renderer/presentation/styles/base.css',
      'src/renderer/infrastructure/services/performance/performance-animation.service.ts',
      'src/renderer/application/orchestrators/performance-animation.orchestrator.ts',
      'tests/e2e/device-streaming.spec.js',
      'tests/e2e/streaming-smoke.spec.js'
    ].forEach((relativePath) => {
      expect(readProjectFile(relativePath)).not.toContain('app-streaming');
    });

    expect(readProjectFile('src/renderer/presentation/styles/base.css')).toContain('body.streaming-mode::after');
  });
});
