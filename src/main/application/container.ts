/**
 * Dependency Injection Container
 * Wires every main-process service onto an Inversify container.
 */

import { Container } from 'inversify';
import pkg from '../../../package.json' assert { type: 'json' };
import { TOKENS, TOKEN_KEYS, type TokenKey } from './di/tokens.js';
import { mainModule } from './di/main.module.js';
import type { MainLogger } from '@main/infrastructure/logging/logger.factory.js';
import { applyBindingOverrides } from '@platform/core';

/**
 * Main-process DI container, backed by Inversify.
 */
export type MainServiceContainer = Container;

/**
 * Build the main-process DI container: pre-seeded config + logger constants,
 * every service bound via {@link mainModule}, then test overrides. No
 * hand-rolled switch — the binding module is the source of truth.
 */
export function createMainContainer(
  loggerFactory: MainLogger,
  overrides: Partial<Record<TokenKey, unknown>> = {}
): MainServiceContainer {
  const container = new Container({ defaultScope: 'Singleton' });

  container.bind(TOKENS.config).toConstantValue({
    isDevelopment: process.env.NODE_ENV === 'development',
    appName: 'PrismGB',
    version: pkg.version
  });
  container.bind(TOKENS.loggerFactory).toConstantValue(loggerFactory);

  container.load(mainModule);

  applyBindingOverrides(container, TOKENS, overrides);

  return container;
}

/**
 * Create the container. Device monitoring starts from AppOrchestrator after
 * app-owned integration side effects have subscribed to runtime events.
 */
export async function createAppContainer(loggerFactory: MainLogger): Promise<MainServiceContainer> {
  const containerLogger = loggerFactory.create('Container');
  containerLogger.info('Initializing dependency injection container');

  const container = createMainContainer(loggerFactory);

  containerLogger.info(`Registered ${TOKEN_KEYS.length} dependencies`);

  return container;
}
