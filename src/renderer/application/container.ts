import { Container } from '@prismgb/core';
import { standardServiceRegistrations } from './di/service-registrations.js';
import { manualProviders } from './di/manual-providers.js';

export type RendererServiceContainer = Container;

/**
 * Unwraps the legacy `{ value }` override envelope while passing plain instances through.
 */
function unwrapOverride(value: unknown): unknown {
  return value && typeof value === 'object' && 'value' in value
    ? (value as { value: unknown }).value
    : value;
}

/**
 * Build a renderer DI container wired onto the core {@link Container} primitive:
 * standard-construction services, non-standard manual providers, then test
 * overrides. No code generation — the registration maps are the source of truth.
 */
export function createRendererContainer(overrides: Record<string, unknown> = {}): RendererServiceContainer {
  const container = new Container();

  for (const [token, factory] of Object.entries(standardServiceRegistrations)) {
    container.register(token, (resolver) => factory(resolver.cradle));
  }

  for (const [token, provider] of Object.entries(manualProviders)) {
    container.register(token, (resolver) => provider((dependency) => resolver.resolve(dependency)));
  }

  for (const [token, value] of Object.entries(overrides)) {
    container.registerValue(token, unwrapOverride(value));
  }

  return container;
}

let container: RendererServiceContainer | null = null;

export function initializeContainer(): RendererServiceContainer {
  if (container) {
    console.warn('Container already initialized');
    return container;
  }

  container = createRendererContainer();
  console.log('DI Container initialized with domain services');
  return container;
}

export function getContainer(): RendererServiceContainer {
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

type DisposalLoggerFactory = {
  create(name: string): { error(...args: unknown[]): void };
};

export async function resetContainer(): Promise<void> {
  const activeContainer = container;
  if (!activeContainer) {
    return;
  }

  container = null;
  const loggerFactory = activeContainer.peek<DisposalLoggerFactory>('loggerFactory');
  const disposalLogger = loggerFactory ? loggerFactory.create('Container') : console;

  try {
    const appOrchestrator = activeContainer.peek('appOrchestrator');
    if (isCleanable(appOrchestrator)) {
      await appOrchestrator.cleanup();
    }
  } finally {
    await activeContainer.dispose(disposalLogger);
  }
}
