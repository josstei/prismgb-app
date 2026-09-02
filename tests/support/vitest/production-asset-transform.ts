import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

export const PRODUCTION_ASSET_TEST_URL_PREFIX = '/__vitest__/production-assets';

const VIRTUAL_URL_MODULE_PREFIX = '\0production-asset-transform:url:';
const GLOB_MAGIC_PATTERN = /[*?\[\]{}]/;
const EAGER_RAW_GLOB_PATTERN = /import\.meta\.glob\(\s*(['\"])([^'\"]+)\1\s*,\s*\{([\s\S]*?)\}\s*\)/g;

export interface ProductionAssetTransformOptions {
  root?: string;
  publicDir?: string;
}

export interface ResolvedProductionAsset {
  filePath: string;
  publicPath: string;
  testUrl: string;
}

export interface RawProductionAsset {
  content: string;
  filePath: string;
  key: string;
}

interface ResolvedOptions {
  publicDir: string;
  root: string;
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

function assertWithinRoot(root: string, candidate: string, label: string): void {
  const relative = path.relative(root, candidate);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes the project root: ${candidate}`);
  }
}

function resolveOptions(options: ProductionAssetTransformOptions = {}): ResolvedOptions {
  return {
    root: path.resolve(options.root ?? process.cwd()),
    publicDir: path.resolve(options.root ?? process.cwd(), options.publicDir ?? 'assets')
  };
}

function canonicalProjectRoot(options: ResolvedOptions): string {
  return realpathSync(options.root);
}

function canonicalPublicDir(options: ResolvedOptions): string {
  const root = canonicalProjectRoot(options);
  const publicDir = realpathSync(options.publicDir);
  assertWithinRoot(root, publicDir, 'Public asset directory');
  return publicDir;
}

function normalizePublicPath(publicPath: string): string {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(publicPath);
  } catch {
    throw new Error(`Production asset URL has invalid encoding: ${publicPath}`);
  }

  if (!decodedPath.startsWith('/')) {
    throw new Error(`Production asset URL must be rooted: ${publicPath}`);
  }

  const segments = decodedPath.slice(1).split('/');
  if (segments.length === 0 || segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('\\') || segment.includes('\0'))) {
    throw new Error(`Production asset URL escapes its public root: ${publicPath}`);
  }

  return `/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;
}

function resolveAssetPath(publicPath: string, options: ResolvedOptions): ResolvedProductionAsset {
  const normalizedPublicPath = normalizePublicPath(publicPath);
  const root = canonicalProjectRoot(options);
  const publicDir = canonicalPublicDir(options);
  const filePath = path.resolve(publicDir, `.${decodeURIComponent(normalizedPublicPath)}`);

  assertWithinRoot(publicDir, filePath, 'Production asset');
  if (!statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Production asset does not exist: ${normalizedPublicPath}`);
  }

  const canonicalFilePath = realpathSync(filePath);
  assertWithinRoot(root, canonicalFilePath, 'Production asset');
  assertWithinRoot(publicDir, canonicalFilePath, 'Production asset');

  return {
    filePath: canonicalFilePath,
    publicPath: normalizedPublicPath,
    testUrl: `${PRODUCTION_ASSET_TEST_URL_PREFIX}${normalizedPublicPath}`
  };
}

export function resolveRootUrlProductionAsset(
  source: string,
  options: ProductionAssetTransformOptions = {}
): ResolvedProductionAsset | null {
  const queryIndex = source.indexOf('?');
  if (queryIndex <= 0) {
    return null;
  }

  const publicPath = source.slice(0, queryIndex);
  if (!publicPath.startsWith('/')) {
    return null;
  }

  const query = new URLSearchParams(source.slice(queryIndex + 1));
  if (!query.has('url')) {
    return null;
  }

  return resolveAssetPath(publicPath, resolveOptions(options));
}

function globToRegExp(pattern: string): RegExp {
  let expression = '^';

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*') {
      if (pattern[index + 1] === '*') {
        index += 1;
        if (pattern[index + 1] === '/') {
          index += 1;
          expression += '(?:.*/)?';
        } else {
          expression += '.*';
        }
      } else {
        expression += '[^/]*';
      }
      continue;
    }

    if (character === '?') {
      expression += '[^/]';
      continue;
    }

    expression += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }

  return new RegExp(`${expression}$`);
}

function walkFiles(directory: string, projectRoot: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => compareStable(left.name, right.name));

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Production asset glob rejects symbolic links: ${entryPath}`);
    }

    if (entry.isDirectory()) {
      files.push(...walkFiles(entryPath, projectRoot));
      continue;
    }

    if (entry.isFile()) {
      const realPath = realpathSync(entryPath);
      assertWithinRoot(projectRoot, realPath, 'Production asset glob result');
      files.push(realPath);
    }
  }

  return files;
}

function resolveGlobScanDirectory(pattern: string, importerDirectory: string): string {
  const segments = toPosixPath(pattern).split('/');
  const staticSegments: string[] = [];

  for (const segment of segments) {
    if (GLOB_MAGIC_PATTERN.test(segment)) {
      break;
    }
    staticSegments.push(segment);
  }

  return path.resolve(importerDirectory, staticSegments.join('/') || '.');
}

export function collectEagerRawProductionAssets(
  globPattern: string,
  importer: string,
  options: ProductionAssetTransformOptions = {}
): RawProductionAsset[] {
  const resolvedOptions = resolveOptions(options);
  const projectRoot = canonicalProjectRoot(resolvedOptions);
  const importerPath = path.resolve(importer.split('?')[0]);
  assertWithinRoot(projectRoot, importerPath, 'Raw asset importer');

  const importerDirectory = path.dirname(importerPath);
  const normalizedPattern = toPosixPath(globPattern);
  const matcher = globToRegExp(normalizedPattern);

  if (!GLOB_MAGIC_PATTERN.test(normalizedPattern)) {
    const assetPath = path.resolve(importerDirectory, normalizedPattern);
    assertWithinRoot(projectRoot, assetPath, 'Production asset glob');
    if (!statSync(assetPath, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Production asset glob did not match a file: ${globPattern}`);
    }

    const realPath = realpathSync(assetPath);
    assertWithinRoot(projectRoot, realPath, 'Production asset glob result');
    return [{
      content: readFileSync(realPath, 'utf8'),
      filePath: realPath,
      key: toPosixPath(path.relative(importerDirectory, realPath))
    }];
  }

  const scanDirectory = resolveGlobScanDirectory(normalizedPattern, importerDirectory);
  assertWithinRoot(projectRoot, scanDirectory, 'Production asset glob');
  if (!statSync(scanDirectory, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Production asset glob directory does not exist: ${globPattern}`);
  }

  const entries = walkFiles(scanDirectory, projectRoot)
    .map((filePath) => ({
      content: readFileSync(filePath, 'utf8'),
      filePath,
      key: toPosixPath(path.relative(importerDirectory, filePath))
    }))
    .filter((entry) => matcher.test(entry.key));

  return entries.sort((left, right) => compareStable(left.key, right.key));
}

export function createStableRawAssetRecord(entries: readonly RawProductionAsset[]): Record<string, string> {
  const record = Object.create(null) as Record<string, string>;

  for (const entry of [...entries].sort((left, right) => compareStable(left.key, right.key))) {
    if (Object.hasOwn(record, entry.key)) {
      throw new Error(`Production asset glob has duplicate key: ${entry.key}`);
    }
    record[entry.key] = entry.content;
  }

  return record;
}

function usesEagerRawDefaultOptions(optionsSource: string): boolean {
  return /\bquery\s*:\s*(['\"])\?raw\1/.test(optionsSource)
    && /\bimport\s*:\s*(['\"])default\1/.test(optionsSource)
    && /\beager\s*:\s*true\b/.test(optionsSource);
}

export function transformEagerRawProductionAssetGlobs(
  code: string,
  importer: string,
  options: ProductionAssetTransformOptions = {}
): { code: string; map: null } | null {
  let transformed = false;
  const transformedCode = code.replace(EAGER_RAW_GLOB_PATTERN, (match, _quote, globPattern: string, optionsSource: string) => {
    if (!usesEagerRawDefaultOptions(optionsSource)) {
      return match;
    }

    transformed = true;
    const entries = collectEagerRawProductionAssets(globPattern, importer, options);
    return JSON.stringify(createStableRawAssetRecord(entries));
  });

  return transformed ? { code: transformedCode, map: null } : null;
}

export function createProductionAssetTransform(options: ProductionAssetTransformOptions = {}): Plugin {
  let resolvedOptions = resolveOptions(options);

  return {
    name: 'production-asset-transform',
    enforce: 'pre',
    configResolved(config) {
      resolvedOptions = resolveOptions({
        root: options.root ?? config.root,
        publicDir: options.publicDir
      });
    },
    resolveId(source) {
      const asset = resolveRootUrlProductionAsset(source, resolvedOptions);
      return asset ? `${VIRTUAL_URL_MODULE_PREFIX}${encodeURIComponent(asset.publicPath)}` : null;
    },
    load(id) {
      if (!id.startsWith(VIRTUAL_URL_MODULE_PREFIX)) {
        return null;
      }

      const publicPath = decodeURIComponent(id.slice(VIRTUAL_URL_MODULE_PREFIX.length));
      const asset = resolveAssetPath(publicPath, resolvedOptions);
      return `export default ${JSON.stringify(asset.testUrl)};`;
    },
    transform(code, id) {
      return transformEagerRawProductionAssetGlobs(code, id, resolvedOptions);
    }
  };
}
