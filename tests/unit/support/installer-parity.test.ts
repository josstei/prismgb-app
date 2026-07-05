import { describe, it, expect } from 'vitest';
import * as Barrel from '../../support/mocks/browser-api.installers.js';

describe('installer barrel parity', () => {
  const expectedSymbols: Array<keyof typeof Barrel> = [
    'createCleanupStack',
    'installTargetProperty',
    'installAnimationFrameMock',
    'installBlobMock',
    'installBlobDownloadMock',
    'installCanvasMocks',
    'installClipboardMock',
    'installCreateImageBitmapMock',
    'installDevicePixelRatioMock',
    'installDocumentPropertyMock',
    'installDocumentCreateElementMock',
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
    'installVideoFrameCallbacksMock',
    'installPerformanceApiMock',
    'installWorkerMock',
    'installWorkerScopeMock',
    'installWindowPropertyMock',
  ];

  it.each(expectedSymbols)('exports %s', (name) => {
    expect(Barrel[name]).toBeDefined();
    expect(typeof Barrel[name]).toBe('function');
  });
});
