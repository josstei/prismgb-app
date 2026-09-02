import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  collectEagerRawProductionAssets,
  createProductionAssetTransform,
  createStableRawAssetRecord,
  PRODUCTION_ASSET_TEST_URL_PREFIX,
  resolveRootUrlProductionAsset,
  transformEagerRawProductionAssetGlobs
} from '../../support/vitest/production-asset-transform.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const iconImporter = path.join(root, 'src/renderer/presentation/icons/icon.utils.ts');

describe('production asset transform', () => {
  it('resolves root url imports to deterministic test URLs through a virtual module', () => {
    const asset = resolveRootUrlProductionAsset('/overlay-icons/default.svg?url', { root });
    const plugin = createProductionAssetTransform({ root });
    const virtualId = plugin.resolveId as (source: string) => string | null;
    const load = plugin.load as (id: string) => string | null;

    expect(asset).toMatchObject({
      filePath: path.join(root, 'assets/overlay-icons/default.svg'),
      publicPath: '/overlay-icons/default.svg',
      testUrl: `${PRODUCTION_ASSET_TEST_URL_PREFIX}/overlay-icons/default.svg`
    });
    expect(virtualId('/overlay-icons/default.svg?url')).toBeTruthy();
    expect(load(virtualId('/overlay-icons/default.svg?url')!)).toBe(
      `export default ${JSON.stringify(`${PRODUCTION_ASSET_TEST_URL_PREFIX}/overlay-icons/default.svg`)};`
    );
  });

  it('loads the tracked eager raw SVG assets in stable key order', () => {
    const assets = collectEagerRawProductionAssets('../../assets/icons/*.svg', iconImporter, { root });
    const keys = assets.map((asset) => asset.key);
    const filter = assets.find((asset) => asset.key.endsWith('/filter.svg'));

    expect(keys).toEqual([...keys].sort());
    expect(filter?.content).toBe(readFileSync(path.join(root, 'src/renderer/assets/icons/filter.svg'), 'utf8'));

    const transformed = transformEagerRawProductionAssetGlobs(
      "const icons = import.meta.glob('../../assets/icons/*.svg', { query: '?raw', import: 'default', eager: true });",
      iconImporter,
      { root }
    );

    expect(transformed?.code).not.toContain('import.meta.glob');
    expect(transformed?.code).toContain(JSON.stringify(filter?.content));
  });

  it('rejects missing public assets', () => {
    expect(() => resolveRootUrlProductionAsset('/missing.svg?url', { root })).toThrow(/does not exist/);
  });

  it('rejects public URL path escapes', () => {
    expect(() => resolveRootUrlProductionAsset('/../package.json?url', { root })).toThrow(/escapes/);
  });

  it('rejects duplicate raw glob keys', () => {
    expect(() => createStableRawAssetRecord([
      { key: '../../assets/icons/filter.svg', content: 'one', filePath: '/first.svg' },
      { key: '../../assets/icons/filter.svg', content: 'two', filePath: '/second.svg' }
    ])).toThrow(/duplicate key/);
  });

  it('stably orders raw asset records regardless of collection order', () => {
    const record = createStableRawAssetRecord([
      { key: './z.svg', content: 'z', filePath: '/z.svg' },
      { key: './a.svg', content: 'a', filePath: '/a.svg' }
    ]);

    expect(Object.keys(record)).toEqual(['./a.svg', './z.svg']);
  });
});
