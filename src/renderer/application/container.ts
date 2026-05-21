/**
 * Renderer DI container composition shell.
 */

import {
  asValue,
  createContainer,
  InjectionMode,
} from '@renderer/infrastructure/di/renderer-container.factory.js';
import type { AwilixContainer } from 'awilix';
import { PresetRegistry } from '@prismgb/gpu';
import { registerInfrastructure } from '@renderer/application/di/register-infrastructure';
import { registerDevices } from '@renderer/application/di/register-devices';
import { registerStreaming } from '@renderer/application/di/register-streaming';
import { registerCapture } from '@renderer/application/di/register-capture';
import { registerUi } from '@renderer/application/di/register-ui';
import { registerOrchestrators } from '@renderer/application/di/register-orchestrators';
import type { RendererContainerMap } from '@renderer/application/di/renderer-container-map.type';

PresetRegistry.setDefault('vibrant');

type RendererServiceContainer = AwilixContainer<RendererContainerMap>;

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
  if (container) {
    await container.dispose();
    container = null;
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
