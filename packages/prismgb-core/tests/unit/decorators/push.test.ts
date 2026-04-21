import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { Push } from '../../../src/decorators/push';
import { Channel } from '../../../src/events/channel';
import { getPushProperties } from '../../../src/metadata/push-metadata';

describe('@Push decorator', () => {
  it('registers a property as a push channel', () => {
    class Service {
      @Push<string>()
      events = new Channel<string>();
    }
    const props = getPushProperties(Service);
    expect(props).toEqual(['events']);
  });

  it('supports multiple @Push properties', () => {
    class Service {
      @Push<string>()
      one = new Channel<string>();
      @Push<number>()
      two = new Channel<number>();
    }
    const props = getPushProperties(Service);
    expect(props.sort()).toEqual(['one', 'two']);
  });

  it('returns empty array for class with no @Push properties', () => {
    class Plain {}
    expect(getPushProperties(Plain)).toEqual([]);
  });
});
