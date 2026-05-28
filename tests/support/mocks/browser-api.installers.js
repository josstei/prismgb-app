// @ts-nocheck
/**
 * Browser API Mocks Installers
 *
 * Central export and barrel for all browser-API installers.
 * Extracted into separate domain modules under tests/support/mocks/installers/
 */

export {
  createCleanupStack,
  installTargetProperty,
} from './runtime-property.installers.js';

export {
  installAnimationFrameMock,
  installVideoFrameCallbacksMock,
} from './installers/animation-frame.installer.js';

export {
  installCanvasMocks,
} from './installers/canvas.installer.js';

export {
  installMissingWindowMock,
  installWindowPropertyMock,
  installGetComputedStyleMock,
  installMatchMediaMock,
  installDocumentPropertyMock,
  installDocumentCreateElementMock,
  installFullscreenDocumentMock,
  installMissingMutationObserverMock,
  installResizeObserverMock,
  installDevicePixelRatioMock,
} from './installers/dom-window.installer.js';

export {
  installLocalStorageMock,
  installClipboardMock,
} from './installers/storage.installer.js';

export {
  installBlobMock,
  installBlobDownloadMock,
  installCreateImageBitmapMock,
} from './installers/blob.installer.js';

export {
  installMediaRecorderMock,
  installMediaMocks,
  installNavigatorMock,
} from './installers/media.installer.js';

export {
  installWorkerMock,
  installWorkerScopeMock,
} from './installers/worker.installer.js';

export {
  installPerformanceApiMock,
} from './installers/performance.installer.js';

// Aliases
import { installAnimationFrameMock } from './installers/animation-frame.installer.js';
import { installBlobMock } from './installers/blob.installer.js';
import { installBlobDownloadMock } from './installers/blob.installer.js';
import { installCanvasMocks } from './installers/canvas.installer.js';
import { installGetComputedStyleMock } from './installers/dom-window.installer.js';
import { installVideoFrameCallbacksMock } from './installers/animation-frame.installer.js';

export const installRafMock = installAnimationFrameMock;
export const installBrowserBlobMock = installBlobMock;
export const installDownloadMock = installBlobDownloadMock;
export const installCanvasMock = installCanvasMocks;
export const installComputedStyleMock = installGetComputedStyleMock;
export const installVideoFrameMock = installVideoFrameCallbacksMock;
