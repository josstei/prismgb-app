import {
  asValue,
  createContainer,
  InjectionMode,
} from '@renderer/infrastructure/di/renderer-container.factory.js';
import type { AwilixContainer } from 'awilix';
import { PRESET_POLICY, PresetRegistry } from '@prismgb/gpu';
import { registerInfrastructure } from '@renderer/application/di/register-infrastructure';
import { registerDevices } from '@renderer/application/di/register-devices';
import { registerStreaming } from '@renderer/application/di/register-streaming';
import { registerCapture } from '@renderer/application/di/register-capture';
import { registerUi } from '@renderer/application/di/register-ui';
import { registerOrchestrators } from '@renderer/application/di/register-orchestrators';
import type { RendererContainerMap } from '@renderer/application/di/renderer-container-map.type';

PresetRegistry.setDefault(PRESET_POLICY.rendererDefaultId);

type RendererServiceContainer = AwilixContainer<RendererContainerMap>;
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

function createRendererContainer(): RendererServiceContainer {
  const container = createContainer<RendererContainerMap>({
    injectionMode: InjectionMode.PROXY
  });

  registerInfrastructure(container);
  registerDevices(container);
  registerStreaming(container);
  registerCapture(container);
  registerUi(container);
  registerOrchestrators(container);

  return container;
}

let container: RendererServiceContainer | null = null;

function initializeContainer(): RendererServiceContainer {
  if (container) {
    console.warn('Container already initialized');
    return container;
  }

  container = createRendererContainer();
  console.log('DI Container initialized with domain services');
  return container;
}

function getContainer(): RendererServiceContainer {
  if (!container) {
    throw new Error('Container not initialized. Call initializeContainer() first.');
  }
  return container;
}

async function resetContainer(): Promise<void> {
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

export {
  createRendererContainer,
  initializeContainer,
  getContainer,
  resetContainer,
  asValue
};

export type {
  RendererServiceContainer
};
