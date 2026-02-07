import { describe, it, expectTypeOf } from 'vitest';
import { ServiceContainer, asValue } from '@renderer/infrastructure/di/service-container.factory.js';

class LoggerService {
  info(message: string) {
    return message;
  }
}

describe('ServiceContainer type contracts', () => {
  it('infers resolve type for singleton registrations', () => {
    const container = new ServiceContainer()
      .registerSingleton('logger', LoggerService);

    expectTypeOf(container.resolve('logger')).toEqualTypeOf<LoggerService>();
  });

  it('infers resolve type for value registrations', () => {
    const container = new ServiceContainer()
      .register({
        appVersion: asValue('1.0.0'),
        featureFlags: asValue({ capture: true })
      });

    expectTypeOf(container.resolve('appVersion')).toEqualTypeOf<string>();
    expectTypeOf(container.resolve('featureFlags')).toEqualTypeOf<{ capture: boolean }>();
  });
});
