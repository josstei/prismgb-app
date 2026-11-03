import { vi } from 'vitest';
import { createCleanupStack, installTargetProperty } from '../runtime-property.installers.js';

/**
 * Canonical canvas and drawing context installer.
 */
export function installCanvasMocks(options = {}) {
  const stack = createCleanupStack();

  const { context = {} } = options;

  const defaultContext = {
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(4),
      width: 1,
      height: 1,
    })),
    putImageData: vi.fn(),
    imageSmoothingEnabled: false,
    webkitImageSmoothingEnabled: false,
    mozImageSmoothingEnabled: false,
    msImageSmoothingEnabled: false,
    fillStyle: '#000000',
    ...context,
  };

  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  const mockGetContext = vi.fn((type) => {
    if (type === '2d') {
      return defaultContext;
    }

    if (typeof originalGetContext === 'function') {
      return originalGetContext(type);
    }

    return null;
  });

  const mockToBlob = vi.fn((callback, type, quality) => {
    const blob = new Blob([`mock-image-data:${quality ?? 'default'}`], {
      type: type || 'image/png',
    });
    setTimeout(() => callback(blob), 0);
  });

  const mockToDataURL = vi.fn((type = 'image/png', quality = 0.92) => {
    if (typeof type === 'string' && type.includes('avif')) {
      return 'data:image/avif;base64,mockImageData';
    }
    if (typeof type === 'string' && type.includes('webp')) {
      return 'data:image/webp;base64,mockImageData';
    }
    return `data:${type};base64,mockImageData${String(quality)}`;
  });

  for (const [name, mock] of Object.entries({
    getContext: mockGetContext,
    toBlob: mockToBlob,
    toDataURL: mockToDataURL
  })) {
    const property = installTargetProperty(HTMLCanvasElement.prototype, name, mock);
    stack.add(() => property.cleanup());
  }

  return {
    ...stack,
    context: defaultContext,
  };
}
