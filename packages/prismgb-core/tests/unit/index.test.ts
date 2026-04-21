import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import * as publicApi from '../../src';

const expectedRuntimeExports = [
  'BufferedChannel',
  'Channel',
  'EventBus',
  'Inject',
  'Injectable',
  'METADATA_KEYS',
  'Module',
  'OnDestroy',
  'OnInit',
  'Push',
  'Rpc',
  'Service',
  'Singleton',
  'Subscribe',
  'WorkerMethod',
  'getModuleMetadata',
  'getOnDestroyMethods',
  'getOnInitMethods',
  'getPushProperties',
  'getRpcMetadata',
  'getServiceMetadata',
  'getSubscribeHandlers',
  'getWorkerMethodMetadata'
] as const;

describe('@prismgb/core public API barrel', () => {
  it('exports every expected runtime symbol', () => {
    for (const name of expectedRuntimeExports) {
      expect(publicApi, `missing export: ${name}`).toHaveProperty(name);
      expect(
        (publicApi as Record<string, unknown>)[name],
        `export ${name} is undefined`
      ).toBeDefined();
    }
  });

  it('exports exactly the expected runtime symbols (no extras, no missing)', () => {
    const actual = Object.keys(publicApi).sort();
    const expected = [...expectedRuntimeExports].sort();
    expect(actual).toEqual(expected);
  });
});
