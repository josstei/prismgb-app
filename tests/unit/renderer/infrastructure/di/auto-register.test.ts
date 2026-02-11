import { describe, it, expect } from 'vitest';
import { ServiceContainer, asValue } from '@renderer/infrastructure/di/service-container.factory.js';

class MockService {
  static readonly dependencies = ['depA', 'depB'] as const;
  depA: unknown;
  depB: unknown;

  constructor(deps: Record<string, unknown>) {
    this.depA = deps.depA;
    this.depB = deps.depB;
  }
}

describe('ServiceContainer.autoRegister', () => {
  it('registers and resolves a service using static dependencies', () => {
    const container = new ServiceContainer();
    container.register({
      depA: asValue('valueA'),
      depB: asValue('valueB')
    });

    container.autoRegister('mockService', MockService);

    const instance = container.resolve('mockService') as MockService;
    expect(instance).toBeInstanceOf(MockService);
    expect(instance.depA).toBe('valueA');
    expect(instance.depB).toBe('valueB');
  });

  it('returns singleton instance on subsequent resolves', () => {
    const container = new ServiceContainer();
    container.register({
      depA: asValue('a'),
      depB: asValue('b')
    });

    container.autoRegister('mockService', MockService);

    const first = container.resolve('mockService');
    const second = container.resolve('mockService');
    expect(first).toBe(second);
  });
});
