import { describe, it, expectTypeOf } from 'vitest';
import { ServiceContainer, asValue } from '@prismgb/di';
import type { RendererContainerMap } from '@renderer/application/di/renderer-container-map.type';

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

  it('enforces renderer container keys at compile-time', () => {
    const container = new ServiceContainer<RendererContainerMap>()
      .register({
        appOrchestrator: asValue({} as RendererContainerMap['appOrchestrator'])
      });

    // @ts-expect-error unknown key should fail compile-time
    container.registerSingleton('notARegisteredRendererKey', () => ({}), []);

    expectTypeOf(container.resolve('appOrchestrator')).toEqualTypeOf<RendererContainerMap['appOrchestrator']>();
  });

  it('infers resolve type for explicit registerFactory/registerClass APIs', () => {
    class ClockService {
      now() {
        return 1;
      }
    }

    const container = new ServiceContainer()
      .registerClass('clock', ClockService)
      .registerFactory('clockNow', (clock: ClockService) => clock.now(), ['clock']);

    expectTypeOf(container.resolve('clock')).toEqualTypeOf<ClockService>();
    expectTypeOf(container.resolve('clockNow')).toEqualTypeOf<number>();
  });
});
