/**
 * Renderer DI container composition shell.
 */

import { ServiceContainer, asValue } from '@renderer/infrastructure/di/service-container.factory.js';
import { PresetRegistry } from '@prismgb/gpu';
import { registerInfrastructure } from '@renderer/application/di/register-infrastructure';
import { registerDevices } from '@renderer/application/di/register-devices';
import { registerStreaming } from '@renderer/application/di/register-streaming';
import { registerCapture } from '@renderer/application/di/register-capture';
import { registerUi } from '@renderer/application/di/register-ui';
import { registerOrchestrators } from '@renderer/application/di/register-orchestrators';

PresetRegistry.setDefault('vibrant');

function createRendererContainer() {
  const container = new ServiceContainer();

  registerInfrastructure(container);
  registerDevices(container);
  registerStreaming(container);
  registerCapture(container);
  registerUi(container);
  registerOrchestrators(container);

  return container;
}

let container = null;

function initializeContainer() {
  if (container) {
    console.warn('Container already initialized');
    return container;
  }

  container = createRendererContainer();
  console.log('DI Container initialized with domain services');
  return container;
}

function getContainer() {
  if (!container) {
    throw new Error('Container not initialized. Call initializeContainer() first.');
  }
  return container;
}

function resetContainer() {
  if (container) {
    container.dispose();
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
