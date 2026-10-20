/**
 * Dependency Injection Container
 * Wires every main-process service onto an Inversify container.
 */

import { Container } from 'inversify';
import pkg from '../../../package.json' assert { type: 'json' };
import { TOKENS, TOKEN_KEYS } from './di/tokens';
import { mainModule } from './di/main.module';
import type { MainLogger } from '@main/infrastructure/logging/logger.factory';

/**
 * Main-process DI container, backed by Inversify.
 */
export type MainServiceContainer = Container;

/**
 * Build the main-process DI container: pre-seeded config + logger constants,
 * then every service bound via {@link mainModule}.
 */
export function createMainContainer(loggerFactory: MainLogger): MainServiceContainer {
  const container = new Container({ defaultScope: 'Singleton' });

  container.bind(TOKENS.config).toConstantValue({
    isDevelopment: process.env.NODE_ENV === 'development',
    appName: 'PrismGB',
    version: pkg.version
  });
  container.bind(TOKENS.loggerFactory).toConstantValue(loggerFactory);

  container.load(mainModule);

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
