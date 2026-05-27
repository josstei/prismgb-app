import { GeneratedContainer } from '../di.generated.js';

export type RendererServiceContainer = GeneratedContainer;

export function asValue<T>(value: T): { value: T } {
  return { value };
}

let container: GeneratedContainer | null = null;

export function createRendererContainer(): GeneratedContainer {
  return new GeneratedContainer();
}

export function initializeContainer(): GeneratedContainer {
  if (container) {
    console.warn('Container already initialized');
    return container;
  }

  container = createRendererContainer();
  console.log('DI Container initialized with domain services');
  return container;
}

export function getContainer(): GeneratedContainer {
  if (!container) {
    throw new Error('Container not initialized. Call initializeContainer() first.');
  }
  return container;
}

type Cleanable = {
  cleanup(): void | Promise<void>;
};

function isCleanable(value: unknown): value is Cleanable {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { cleanup?: unknown }).cleanup === 'function'
  );
}

export async function resetContainer(): Promise<void> {
  const activeContainer = container;
  if (activeContainer) {
    container = null;
    try {
      const appOrchestrator = activeContainer.cache.get('appOrchestrator')?.value;
      if (isCleanable(appOrchestrator)) {
        await appOrchestrator.cleanup();
      }
    } finally {
      await activeContainer.dispose();
    }
  }
}
