/**
 * Browser API Mocks Installers
 *
 * Central export and barrel for all browser-API installers.
 * Extracted into separate domain modules under tests/support/mocks/installers/
 */

export {
  createCleanupStack,
} from './runtime-property.installers.js';

export {
  installAnimationFrameMock,
  installVideoFrameCallbacksMock,
} from './installers/animation-frame.installer.js';

export {
  installCanvasMocks,
} from './installers/canvas.installer.js';

export {
  installWindowPropertyMock,
  installGetComputedStyleMock,
  installMatchMediaMock,
  installDocumentPropertyMock,
  installDocumentCreateElementMock,
  installFullscreenDocumentMock,
  installResizeObserverMock,
} from './installers/dom-window.installer.js';

export {
  installLocalStorageMock,
  installClipboardMock,
} from './installers/storage.installer.js';

export {
  installBlobMock,
  installBlobDownloadMock,
} from './installers/blob.installer.js';

export {
  installMediaRecorderMock,
  installMediaMocks,
  installNavigatorMock,
} from './installers/media.installer.js';
