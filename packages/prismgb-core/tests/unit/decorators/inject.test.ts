import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { container } from 'tsyringe';
import { Injectable } from '../../../src/decorators/injectable';
import { Inject } from '../../../src/decorators/inject';

describe('@Inject decorator', () => {
  it('injects a value by token', () => {
    container.register('CONFIG_TOKEN', { useValue: { setting: 'abc' } });

    @Injectable()
    class Consumer {
      constructor(@Inject('CONFIG_TOKEN') public readonly config: { setting: string }) {}
    }

    const instance = container.resolve(Consumer);
    expect(instance.config.setting).toBe('abc');
  });
});
