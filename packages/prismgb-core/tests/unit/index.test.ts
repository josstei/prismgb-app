import { describe, it, expect } from 'vitest';
import { Container } from '../../src/index';

describe('Container primitive', () => {
  it('should register and resolve dependency factories', () => {
    const container = new Container<{ db: string; service: { db: string } }>();
    container.register('db', () => 'sqlite');
    container.register('service', (c) => ({ db: c.resolve('db') }));

    const service = container.resolve('service');
    expect(service.db).toBe('sqlite');
    expect(container.resolve('service')).toBe(service);
  });

  it('should throw error when resolving unregistered token', () => {
    const container = new Container<any>();
    expect(() => container.resolve('missing')).toThrow();
  });
});
