import { describe, expect, expectTypeOf, it } from 'vitest';
import { EventChannels as SharedEventChannels } from '@shared/events/event-channels.js';
import { MainEventChannels } from '@main/infrastructure/events/event-channels.config.js';
import type { MainEventChannel } from '@main/infrastructure/events/event-channels.config.js';
import eventManifest from '@shared/events/event.manifest.json';

function flattenEventValues(node: unknown): string[] {
  const values: string[] = [];

  if (!node || typeof node !== 'object') {
    return values;
  }

  for (const value of Object.values(node)) {
    if (typeof value === 'string') {
      values.push(value);
      continue;
    }

    values.push(...flattenEventValues(value));
  }

  return values;
}

describe('Shared event channel contract', () => {
  it('keeps all event channels unique', () => {
    const values = flattenEventValues(SharedEventChannels);
    expect(new Set(values).size).toBe(values.length);
  });

  it('keeps main event channels derived from manifest scope', () => {
    const mainValues = Object.values(MainEventChannels).flatMap((group) => Object.values(group));
    const manifestMain = eventManifest.scopes
      .find((scope) => scope.scope === 'main')
      ?.events
      .map((entry) => entry.value) || [];

    expect(mainValues).toEqual(expect.arrayContaining(manifestMain));
    expect(mainValues).toHaveLength(manifestMain.length);
    expect(new Set(mainValues).size).toBe(mainValues.length);
  });

  it('keeps main event channel type narrowed to manifest values', () => {
    expectTypeOf<MainEventChannel>().toEqualTypeOf<
      'device:connection-changed' | 'device:check-error' | 'update:state-changed'
    >();
  });

  it('enforces event naming format', () => {
    const values = flattenEventValues(SharedEventChannels);
    for (const eventName of values) {
      expect(eventName).toMatch(/^[a-z]+:[a-z0-9-]+$/);
    }
  });
});
