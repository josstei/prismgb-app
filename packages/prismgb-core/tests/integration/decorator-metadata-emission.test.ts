import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { container } from 'tsyringe';
import { Injectable } from '../../src/decorators/injectable';
import { Service } from '../../src/decorators/service';
import { OnInit } from '../../src/decorators/on-init';
import { Rpc } from '../../src/decorators/rpc';
import { getServiceMetadata } from '../../src/metadata/service-metadata';
import { getOnInitMethods } from '../../src/metadata/lifecycle-metadata';
import { getRpcMetadata } from '../../src/metadata/rpc-metadata';

class FakeLogger {
  readonly log = (msg: string) => msg;
}

@Injectable()
@Service({ runs: 'main' })
class FakeService {
  initialized = false;

  constructor(public readonly logger: FakeLogger) {}

  @OnInit()
  async init(): Promise<void> {
    this.initialized = true;
  }

  @Rpc()
  async listItems(): Promise<string[]> {
    return ['a', 'b'];
  }
}

describe('decorator metadata emission end-to-end', () => {
  it('emits design:paramtypes for @Injectable constructor parameters', () => {
    const paramTypes = Reflect.getMetadata('design:paramtypes', FakeService);
    expect(paramTypes).toBeDefined();
    expect(Array.isArray(paramTypes)).toBe(true);
    expect(paramTypes).toHaveLength(1);
    expect(paramTypes[0]).toBe(FakeLogger);
  });

  it('composes @Injectable + @Service + @OnInit + @Rpc correctly', () => {
    expect(getServiceMetadata(FakeService)).toEqual({ runs: 'main' });
    expect(getOnInitMethods(FakeService)).toEqual(['init']);
    expect(getRpcMetadata(FakeService)).toHaveLength(1);
    expect(getRpcMetadata(FakeService)[0].methodName).toBe('listItems');
  });

  it('tsyringe resolves the decorated class with injection', () => {
    container.register(FakeLogger, { useClass: FakeLogger });
    const instance = container.resolve(FakeService);
    expect(instance).toBeInstanceOf(FakeService);
    expect(instance.logger).toBeInstanceOf(FakeLogger);
    expect(instance.initialized).toBe(false);
  });
});
