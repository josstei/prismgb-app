#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const SOURCE_FILE_EXTENSIONS = new Set(['.js', '.ts']);

const LayerIds = {
  CORE: 'core',
  MAIN_ENTRY: 'main/entry',
  MAIN_BOOTSTRAP: 'main/bootstrap',
  MAIN_APPLICATION: 'main/application',
  MAIN_INFRASTRUCTURE: 'main/infrastructure',
  MAIN_IPC: 'main/ipc',
  RENDERER_ENTRY: 'renderer/entry',
  RENDERER_BOOTSTRAP: 'renderer/bootstrap',
  RENDERER_APPLICATION: 'renderer/application',
  RENDERER_INFRASTRUCTURE: 'renderer/infrastructure',
  RENDERER_PRESENTATION: 'renderer/presentation',
  RENDERER_SHARED: 'renderer/lib',
  PRELOAD: 'preload'
};

const SPECIAL_FILE_LAYER_MAP = new Map([
  ['main/index.ts', LayerIds.MAIN_ENTRY],
  ['main/index', LayerIds.MAIN_ENTRY],
  ['main/app-bootstrap.ts', LayerIds.MAIN_BOOTSTRAP],
  ['main/app-bootstrap', LayerIds.MAIN_BOOTSTRAP],
  ['renderer/index.ts', LayerIds.RENDERER_ENTRY],
  ['renderer/index', LayerIds.RENDERER_ENTRY],
  ['renderer/app-bootstrap.ts', LayerIds.RENDERER_BOOTSTRAP],
  ['renderer/app-bootstrap', LayerIds.RENDERER_BOOTSTRAP]
]);

const LAYER_SEQUENCE = [
  LayerIds.CORE,
  LayerIds.MAIN_ENTRY,
  LayerIds.MAIN_BOOTSTRAP,
  LayerIds.MAIN_APPLICATION,
  LayerIds.MAIN_INFRASTRUCTURE,
  LayerIds.MAIN_IPC,
  LayerIds.RENDERER_ENTRY,
  LayerIds.RENDERER_BOOTSTRAP,
  LayerIds.RENDERER_APPLICATION,
  LayerIds.RENDERER_INFRASTRUCTURE,
  LayerIds.RENDERER_PRESENTATION,
  LayerIds.RENDERER_SHARED,
  LayerIds.PRELOAD
];

const FORBIDDEN_LAYER_MAP = {
  [LayerIds.MAIN_ENTRY]: new Set([
    LayerIds.CORE,
    LayerIds.RENDERER_ENTRY,
    LayerIds.RENDERER_BOOTSTRAP,
    LayerIds.RENDERER_APPLICATION,
    LayerIds.RENDERER_INFRASTRUCTURE,
    LayerIds.RENDERER_PRESENTATION
  ]),
  [LayerIds.MAIN_BOOTSTRAP]: new Set([
    LayerIds.CORE,
    LayerIds.RENDERER_ENTRY,
    LayerIds.RENDERER_BOOTSTRAP,
    LayerIds.RENDERER_APPLICATION,
    LayerIds.RENDERER_INFRASTRUCTURE,
    LayerIds.RENDERER_PRESENTATION
  ]),
  [LayerIds.MAIN_APPLICATION]: new Set([
    LayerIds.CORE,
    LayerIds.MAIN_ENTRY,
    LayerIds.MAIN_BOOTSTRAP,
    LayerIds.RENDERER_APPLICATION,
    LayerIds.RENDERER_INFRASTRUCTURE,
    LayerIds.RENDERER_PRESENTATION
  ]),
  [LayerIds.MAIN_INFRASTRUCTURE]: new Set([
    LayerIds.CORE,
    LayerIds.MAIN_ENTRY,
    LayerIds.MAIN_BOOTSTRAP,
    LayerIds.RENDERER_APPLICATION,
    LayerIds.RENDERER_INFRASTRUCTURE,
    LayerIds.RENDERER_PRESENTATION
  ]),
  [LayerIds.MAIN_IPC]: new Set([
    LayerIds.CORE,
    LayerIds.MAIN_ENTRY,
    LayerIds.MAIN_BOOTSTRAP,
    LayerIds.RENDERER_APPLICATION,
    LayerIds.RENDERER_INFRASTRUCTURE,
    LayerIds.RENDERER_PRESENTATION
  ]),
  [LayerIds.RENDERER_ENTRY]: new Set([
    LayerIds.CORE,
    LayerIds.MAIN_ENTRY,
    LayerIds.MAIN_BOOTSTRAP,
    LayerIds.MAIN_APPLICATION,
    LayerIds.MAIN_INFRASTRUCTURE,
    LayerIds.MAIN_IPC
  ]),
  [LayerIds.RENDERER_BOOTSTRAP]: new Set([
    LayerIds.CORE,
    LayerIds.MAIN_ENTRY,
    LayerIds.MAIN_BOOTSTRAP,
    LayerIds.MAIN_APPLICATION,
    LayerIds.MAIN_INFRASTRUCTURE,
    LayerIds.MAIN_IPC
  ]),
  [LayerIds.RENDERER_APPLICATION]: new Set([
    LayerIds.CORE,
    LayerIds.RENDERER_ENTRY,
    LayerIds.RENDERER_BOOTSTRAP,
    LayerIds.MAIN_APPLICATION,
    LayerIds.MAIN_INFRASTRUCTURE,
    LayerIds.MAIN_IPC
  ]),
  [LayerIds.RENDERER_INFRASTRUCTURE]: new Set([
    LayerIds.CORE,
    LayerIds.RENDERER_ENTRY,
    LayerIds.RENDERER_BOOTSTRAP,
    LayerIds.MAIN_APPLICATION,
    LayerIds.MAIN_INFRASTRUCTURE,
    LayerIds.MAIN_IPC,
    LayerIds.RENDERER_PRESENTATION
  ]),
  [LayerIds.RENDERER_PRESENTATION]: new Set([
    LayerIds.CORE,
    LayerIds.RENDERER_ENTRY,
    LayerIds.RENDERER_BOOTSTRAP,
    LayerIds.MAIN_APPLICATION,
    LayerIds.MAIN_INFRASTRUCTURE,
    LayerIds.MAIN_IPC,
    LayerIds.RENDERER_INFRASTRUCTURE
  ]),

  [LayerIds.RENDERER_SHARED]: new Set([
    LayerIds.MAIN_ENTRY,
    LayerIds.MAIN_BOOTSTRAP,
    LayerIds.MAIN_APPLICATION,
    LayerIds.MAIN_INFRASTRUCTURE,
    LayerIds.MAIN_IPC,
    LayerIds.RENDERER_ENTRY,
    LayerIds.RENDERER_BOOTSTRAP,
    LayerIds.RENDERER_APPLICATION,
    LayerIds.RENDERER_INFRASTRUCTURE,
    LayerIds.RENDERER_PRESENTATION,
    LayerIds.PRELOAD
  ]),

  [LayerIds.PRELOAD]: new Set([
    LayerIds.CORE,
    LayerIds.MAIN_ENTRY,
    LayerIds.MAIN_APPLICATION,
    LayerIds.MAIN_INFRASTRUCTURE,
    LayerIds.MAIN_IPC,
    LayerIds.RENDERER_ENTRY,
    LayerIds.RENDERER_BOOTSTRAP,
    LayerIds.RENDERER_APPLICATION,
    LayerIds.RENDERER_INFRASTRUCTURE,
    LayerIds.RENDERER_PRESENTATION
  ])
};

function normalizePath(value) {
  return value.split(path.sep).join('/');
}

export function walkCodeFiles(rootDir) {
  if (!rootDir || !fs.existsSync(rootDir)) {
    return [];
  }

  const files = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkCodeFiles(fullPath));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name);
    if (SOURCE_FILE_EXTENSIONS.has(extension)) {
      files.push(fullPath);
    }
  }

  return files;
}

export function getImportSpecifiers(sourceCode) {
  const specifiers = [];
  const patterns = [
    { regex: /(?:^|\s)import\s+(type\s+)?(?:[\s\S]*?\sfrom\s*)?['"]([^'"]+)['"]/gm, typeGroup: 1, specifierGroup: 2 },
    { regex: /(?:^|\s)export\s+(type\s+)?[\s\S]*?\sfrom\s*['"]([^'"]+)['"]/gm, typeGroup: 1, specifierGroup: 2 },
    { regex: /import\(\s*['"]([^'"]+)['"]\s*\)/gm, typeGroup: null, specifierGroup: 1 }
  ];

  for (const { regex, typeGroup, specifierGroup } of patterns) {
    for (const match of sourceCode.matchAll(regex)) {
      specifiers.push({
        specifier: match[specifierGroup],
        typeOnly: typeGroup !== null && Boolean(match[typeGroup])
      });
    }
  }

  return specifiers;
}

function classifyLayerFromSourceRelativePath(relativePath) {
  const normalized = normalizePath(relativePath);
  const specialLayer = SPECIAL_FILE_LAYER_MAP.get(normalized);
  if (specialLayer) {
    return specialLayer;
  }

  for (const layerId of LAYER_SEQUENCE) {
    if (normalized === layerId || normalized.startsWith(`${layerId}/`)) {
      return layerId;
    }
  }

  return null;
}

export function classifyFileLayer(filePath, srcRoot) {
  if (!srcRoot) {
    return null;
  }

  const relativePath = path.relative(srcRoot, filePath);
  if (relativePath.startsWith('..')) {
    return null;
  }

  return classifyLayerFromSourceRelativePath(relativePath);
}

function resolveAliasTarget(specifier) {
  if (specifier.startsWith('@/')) {
    return classifyLayerFromSourceRelativePath(specifier.slice(2));
  }

  if (specifier.startsWith('@main/')) {
    return classifyLayerFromSourceRelativePath(specifier.slice(1));
  }

  if (specifier.startsWith('@renderer/')) {
    return classifyLayerFromSourceRelativePath(specifier.slice(1));
  }

  if (specifier.startsWith('@preload/')) {
    return LayerIds.PRELOAD;
  }

  if (specifier.startsWith('@core/')) {
    return LayerIds.CORE;
  }

  return null;
}

export function resolveTargetLayer(specifier, sourceFilePath, srcRoot) {
  const aliasLayer = resolveAliasTarget(specifier);
  if (aliasLayer) {
    return aliasLayer;
  }

  if (!specifier.startsWith('.')) {
    return null;
  }

  const absoluteTargetPath = path.resolve(path.dirname(sourceFilePath), specifier);
  return classifyFileLayer(absoluteTargetPath, srcRoot);
}

/**
 * Type-only imports carry zero runtime coupling (they are erased by the compiler), so they do not
 * create the cross-layer runtime dependency these rules guard against. The renderer's tRPC client
 * must `import type { AppRouter }` from `main/ipc/router` for end-to-end type inference; this exempts
 * that single edge only. All value-level imports — and every other layer pair — remain enforced.
 */
function isExemptTypeOnlyImport(typeOnly, sourceLayer, targetLayer) {
  return (
    typeOnly &&
    sourceLayer === LayerIds.RENDERER_INFRASTRUCTURE &&
    targetLayer === LayerIds.MAIN_IPC
  );
}

function buildViolationMessage(sourceLayer, targetLayer) {
  return `${sourceLayer} cannot depend on ${targetLayer}.`;
}

export function analyzeLayerBoundaries({ projectRoot = process.cwd() } = {}) {
  const srcRoot = path.join(projectRoot, 'src');
  const violations = [];

  if (!fs.existsSync(srcRoot)) {
    return { violations, fileCount: 0 };
  }

  const allFiles = walkCodeFiles(srcRoot);

  for (const filePath of allFiles) {
    const sourceLayer = classifyFileLayer(filePath, srcRoot);
    if (!sourceLayer) {
      continue;
    }

    const forbiddenLayers = FORBIDDEN_LAYER_MAP[sourceLayer];
    if (!forbiddenLayers) {
      continue;
    }

    const sourceCode = fs.readFileSync(filePath, 'utf8');
    const specifiers = getImportSpecifiers(sourceCode);

    for (const { specifier, typeOnly } of specifiers) {
      const targetLayer = resolveTargetLayer(specifier, filePath, srcRoot);
      if (!targetLayer) {
        continue;
      }

      if (!forbiddenLayers.has(targetLayer)) {
        continue;
      }

      if (isExemptTypeOnlyImport(typeOnly, sourceLayer, targetLayer)) {
        continue;
      }

      violations.push({
        filePath,
        sourceLayer,
        targetLayer,
        specifier,
        message: buildViolationMessage(sourceLayer, targetLayer)
      });
    }
  }

  violations.sort((a, b) => {
    const fileCompare = a.filePath.localeCompare(b.filePath);
    if (fileCompare !== 0) {
      return fileCompare;
    }

    return a.specifier.localeCompare(b.specifier);
  });

  return {
    violations,
    fileCount: allFiles.length
  };
}

function runCli() {
  const projectRoot = process.cwd();
  const { violations } = analyzeLayerBoundaries({ projectRoot });

  if (violations.length > 0) {
    console.error('Architecture boundary violations:');
    for (const violation of violations) {
      const relativePath = path.relative(projectRoot, violation.filePath);
      console.error(`- ${relativePath}: ${violation.message} (${violation.specifier})`);
    }
    process.exit(1);
  }

  console.log('Architecture boundary checks passed.');
}

const invokedScript = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedScript) {
  runCli();
}
