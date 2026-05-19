import { describe, it, expectTypeOf } from 'vitest';
import {
  createContainer,
  defineRendererDescriptors,
  registerRendererDescriptors
} from '@renderer/infrastructure/di/renderer-container.factory.ts';

interface TestContainerMap {
  logger: { create: () => { info: () => void } };
  service: { logger: TestContainerMap['logger'] };
  appSetting: string;
}

describe('Renderer DI type contracts', () => {
  it('preserves resolve types for value, class, and function tokens', () => {
    const container = createContainer<TestContainerMap>();

    registerRendererDescriptors(
      container,
      defineRendererDescriptors<TestContainerMap>([
        {
          token: 'logger',
          kind: 'value',
          value: { create: () => ({ info: () => {} }) }
        },
        {
          token: 'service',
          kind: 'class',
          // The constructor shape is intentionally minimal for typing only.
          resolver: class {
            logger: TestContainerMap['logger'];
            constructor(dependencies: { logger: TestContainerMap['logger'] }) {
              this.logger = dependencies.logger;
            }
          }
        },
        {
          token: 'appSetting',
          kind: 'value',
          value: 'app'
        }
      ])
    );

    expectTypeOf(container.resolve('logger')).toEqualTypeOf<TestContainerMap['logger']>();
    expectTypeOf(container.resolve('service')).toEqualTypeOf<TestContainerMap['service']>();
    expectTypeOf(container.resolve('appSetting')).toEqualTypeOf<string>();
  });

  it('disallows unknown tokens at compile time', () => {
    const container = createContainer<TestContainerMap>();
    // @ts-expect-error token must be one of TestContainerMap keys
    registerRendererDescriptors(
      container,
      defineRendererDescriptors<TestContainerMap>([
        {
          token: 'notRegistered',
          kind: 'value',
          value: 123
        }
      ])
    );
  });

  it('infers renderer container resolution for known keys', () => {
    // Smoke compile-time check for renderer container map typing
    class AppOrchestrator {}
    const container = createContainer<{ appOrchestrator: AppOrchestrator }>();
    registerRendererDescriptors(
      container,
      defineRendererDescriptors<{ appOrchestrator: AppOrchestrator }>([
        {
          token: 'appOrchestrator',
          kind: 'class',
          resolver: AppOrchestrator
        }
      ])
    );

    expectTypeOf(container.resolve('appOrchestrator')).toEqualTypeOf<AppOrchestrator>();
  });
});
