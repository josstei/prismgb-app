// @ts-nocheck
import { vi } from 'vitest';
import { installTargetProperty } from '../runtime-property.installers.js';
import { installProperty } from './install-property.helper.js';

/**
 * Canonical Worker constructor installer.
 */
export function installWorkerMock(options = {}) {
  const workers = [];
  const createWorker = options.createWorker ?? (() => ({
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null,
    onerror: null,
  }));

  const mockWorkerConstructor = options.Worker ?? vi.fn(function Worker(...args) {
    const worker = createWorker(...args);
    workers.push(worker);
    return worker;
  });

  return {
    ...installProperty(globalThis, 'Worker', mockWorkerConstructor),
    Worker: mockWorkerConstructor,
    workers,
    getLatestWorker: () => workers[workers.length - 1] ?? null,
  };
}

/**
 * Canonical worker scope installer for tests that import worker entry modules.
 */
export function installWorkerScopeMock(options = {}) {
  const postedMessages = options.postedMessages ?? [];
  const close = options.close ?? vi.fn();
  const postMessage = options.postMessage ?? vi.fn((...args) => {
    postedMessages.push(args);
  });
  const scope = options.scope ?? {
    onmessage: null,
    postMessage,
    close,
  };
  const stack = installTargetProperty(globalThis, 'self', scope);

  return {
    ...stack,
    scope,
    postedMessages,
    postMessage,
    close,
  };
}
