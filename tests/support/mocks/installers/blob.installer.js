import { vi } from 'vitest';
import { createCleanupStack, installTargetProperty } from '../runtime-property.installers.js';
import { installProperty } from './install-property.helper.js';

/**
 * Canonical Blob constructor installer for tests that need deterministic size/type.
 */
export function installBlobMock(options = {}) {
  const MockBlob = options.BlobClass ?? class MockBlob {
    constructor(parts = [], blobOptions = {}) {
      this.parts = parts;
      this.type = blobOptions.type || options.defaultType || 'application/octet-stream';
      this.size = options.size ?? 1000;
    }
  };
  const stack = installProperty(globalThis, 'Blob', MockBlob);

  return {
    ...stack,
    Blob: MockBlob,
  };
}

/**
 * Canonical blob download installer for URL object URLs and anchor clicks.
 */
export function installBlobDownloadMock(options = {}) {
  const stack = createCleanupStack();
  const windowTarget = globalThis.window;
  const documentTarget = globalThis.document;

  if (!windowTarget) {
    throw new Error('Cannot install blob download mock without a window global');
  }
  if (!documentTarget?.body) {
    throw new Error('Cannot install blob download mock without document.body');
  }

  if (!windowTarget.URL) {
    const urlStack = installTargetProperty(windowTarget, 'URL', {});
    stack.add(() => urlStack.cleanup());
  }

  const objectUrl = options.objectUrl ?? 'blob:test';
  const anchor = options.anchor ?? {
    href: '',
    download: '',
    click: vi.fn(),
    style: {},
  };
  const createObjectURL = options.createObjectURL ?? vi.fn(() => objectUrl);
  const revokeObjectURL = options.revokeObjectURL ?? vi.fn();
  const createElement = options.createElement ?? vi.fn(() => anchor);
  const appendChild = options.appendChild ?? vi.fn((node) => node);
  const removeChild = options.removeChild ?? vi.fn((node) => node);

  [
    installTargetProperty(windowTarget.URL, 'createObjectURL', createObjectURL),
    installTargetProperty(windowTarget.URL, 'revokeObjectURL', revokeObjectURL),
    installTargetProperty(documentTarget, 'createElement', createElement),
    installTargetProperty(documentTarget.body, 'appendChild', appendChild),
    installTargetProperty(documentTarget.body, 'removeChild', removeChild),
  ].forEach((propertyStack) => stack.add(() => propertyStack.cleanup()));

  return {
    ...stack,
    anchor,
    objectUrl,
    createObjectURL,
    revokeObjectURL,
    createElement,
    appendChild,
    removeChild,
  };
}

/**
 * Canonical createImageBitmap installer.
 */
export function installCreateImageBitmapMock(options = {}) {
  const imageBitmap = options.imageBitmap ?? { close: vi.fn() };
  const mockCreateImageBitmap = options.createImageBitmap ?? vi.fn().mockResolvedValue(imageBitmap);
  const stack = installProperty(globalThis, 'createImageBitmap', mockCreateImageBitmap);

  return {
    ...stack,
    createImageBitmap: mockCreateImageBitmap,
    imageBitmap,
  };
}
