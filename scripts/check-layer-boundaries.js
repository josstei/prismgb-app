#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const SOURCE_FILE_EXTENSIONS = new Set(['.js', '.ts']);

const LayerIds = {
  CORE: 'core',
  MAIN_ENTRY: 'main/entry',
  MAIN_APPLICATION: 'main/application',
  MAIN_INFRASTRUCTURE: 'main/infrastructure',
  MAIN_IPC: 'main/ipc',
  RENDERER_ENTRY: 'renderer/entry',
  RENDERER_BOOTSTRAP: 'renderer/bootstrap',
  RENDERER_APPLICATION: 'renderer/application',
  RENDERER_INFRASTRUCTURE: 'renderer/infrastructure',
  RENDERER_PRESENTATION: 'renderer/presentation',
  SHARED: 'shared',
  PRELOAD: 'preload'
};

const SPECIAL_FILE_LAYER_MAP = new Map([
  ['main/index.ts', LayerIds.MAIN_ENTRY],
  ['main/index', LayerIds.MAIN_ENTRY],
  ['renderer/index.ts', LayerIds.RENDERER_ENTRY],
  ['renderer/index', LayerIds.RENDERER_ENTRY],
  ['renderer/renderer-app.orchestrator.ts', LayerIds.RENDERER_BOOTSTRAP],
  ['renderer/renderer-app.orchestrator', LayerIds.RENDERER_BOOTSTRAP]
]);

const LAYER_SEQUENCE = [
  LayerIds.CORE,
  LayerIds.MAIN_ENTRY,
  LayerIds.MAIN_APPLICATION,
  LayerIds.MAIN_INFRASTRUCTURE,
  LayerIds.MAIN_IPC,
  LayerIds.RENDERER_ENTRY,
  LayerIds.RENDERER_BOOTSTRAP,
  LayerIds.RENDERER_APPLICATION,
  LayerIds.RENDERER_INFRASTRUCTURE,
  LayerIds.RENDERER_PRESENTATION,
  LayerIds.SHARED,
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
  [LayerIds.MAIN_APPLICATION]: new Set([
    LayerIds.CORE,
    LayerIds.MAIN_ENTRY,
    LayerIds.RENDERER_APPLICATION,
    LayerIds.RENDERER_INFRASTRUCTURE,
    LayerIds.RENDERER_PRESENTATION
  ]),
  [LayerIds.MAIN_INFRASTRUCTURE]: new Set([
    LayerIds.CORE,
    LayerIds.MAIN_ENTRY,
    LayerIds.RENDERER_APPLICATION,
    LayerIds.RENDERER_INFRASTRUCTURE,
    LayerIds.RENDERER_PRESENTATION
  ]),
  [LayerIds.MAIN_IPC]: new Set([
    LayerIds.CORE,
    LayerIds.MAIN_ENTRY,
    LayerIds.RENDERER_APPLICATION,
    LayerIds.RENDERER_INFRASTRUCTURE,
    LayerIds.RENDERER_PRESENTATION
  ]),
  [LayerIds.RENDERER_ENTRY]: new Set([
    LayerIds.CORE,
    LayerIds.MAIN_ENTRY,
    LayerIds.MAIN_APPLICATION,
    LayerIds.MAIN_INFRASTRUCTURE,
    LayerIds.MAIN_IPC
  ]),
  [LayerIds.RENDERER_BOOTSTRAP]: new Set([
    LayerIds.CORE,
    LayerIds.MAIN_ENTRY,
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
  [LayerIds.SHARED]: new Set([
    LayerIds.CORE,
    LayerIds.MAIN_ENTRY,
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

/**
 * Package-level boundary rules. Distinct from LayerIds/FORBIDDEN_LAYER_MAP
 * which enforce process/layer boundaries within src/.
 *
 * Each rule is { id, fromPattern (RegExp), forbiddenPattern (RegExp), message }.
 * - fromPattern matches OS-native file paths (supports POSIX and Windows separators).
 * - forbiddenPattern matches module specifiers (always POSIX-style).
 *
 * Rule 1 (tier2-no-cross-import) has asymmetric gpu exclusion:
 * - fromPattern excludes gpu because it is currently the only Tier 2 package
 *   (no cross-imports possible). When additional Tier 2 packages are added in
 *   Phase 1+, gpu must be removed from the fromPattern exclusion.
 * - forbiddenPattern does NOT exclude gpu because future Tier 2 packages must
 *   not import from gpu either — they should share types via @prismgb/contracts.
 *
 * Rules are inert until Phase 1+ creates capability packages. They activate
 * automatically as new packages are added.
 */
const PACKAGE_RULES = [
  {
    id: 'tier2-no-cross-import',
    fromPattern: /[/\\]packages[/\\]prismgb-(?!core|transport|runtime|contracts|testing|gpu)[^/\\]+[/\\]/,
    forbiddenPattern: /^@prismgb\/(?!core|transport|runtime|contracts|testing)[\w-]+(\/|$)/,
    message: 'Tier 2 capability packages must not import from each other; share contracts via @prismgb/contracts or communicate via events.'
  },
  {
    id: 'src-no-internal-package-paths',
    fromPattern: /[/\\]src[/\\]/,
    forbiddenPattern: /^@prismgb\/[\w-]+\/src\//,
    message: 'src/ must only import from package public subpath exports (./shared, ./main, ./renderer, ./worker), not internal src/ paths.'
  },
  {
    id: 'renderer-no-main-or-worker-package',
    fromPattern: /[/\\]src[/\\]renderer[/\\]/,
    forbiddenPattern: /^@prismgb\/[\w-]+\/(main|worker)(\/|$)/,
    message: 'Renderer process cannot import main-side or worker-side package code.'
  },
  {
    id: 'main-no-renderer-or-worker-package',
    fromPattern: /[/\\]src[/\\]main[/\\]/,
    forbiddenPattern: /^@prismgb\/[\w-]+\/(renderer|worker)(\/|$)/,
    message: 'Main process cannot import renderer-side or worker-side package code.'
  },
  {
    id: 'worker-no-main-or-renderer-package',
    fromPattern: /[/\\]packages[/\\][^/\\]+[/\\]src[/\\]worker[/\\]/,
    forbiddenPattern: /^@prismgb\/[\w-]+\/(main|renderer)(\/|$)/,
    message: 'Worker code cannot import main-side or renderer-side package code.'
  },
  {
    id: 'presentation-no-transport-main',
    fromPattern: /[/\\]src[/\\]renderer[/\\]presentation[/\\]/,
    forbiddenPattern: /^@prismgb\/transport\/main(\/|$)/,
    message: 'Presentation layer cannot directly use transport/main. Go through a service.'
  }
];

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
    /(?:^|\s)import\s+(?:[\s\S]*?\sfrom\s*)?['"]([^'"]+)['"]/gm,
    /(?:^|\s)export\s+[\s\S]*?\sfrom\s*['"]([^'"]+)['"]/gm,
    /import\(\s*['"]([^'"]+)['"]\s*\)/gm
  ];

  for (const pattern of patterns) {
    for (const match of sourceCode.matchAll(pattern)) {
      specifiers.push(match[1]);
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

  if (specifier.startsWith('@shared/')) {
    return LayerIds.SHARED;
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

function buildViolationMessage(sourceLayer, targetLayer) {
  return `${sourceLayer} cannot depend on ${targetLayer}.`;
}

function checkPackageRules(filePath, specifiers) {
  const violations = [];

  for (const rule of PACKAGE_RULES) {
    if (!rule.fromPattern.test(filePath)) {
      continue;
    }

    for (const specifier of specifiers) {
      if (rule.forbiddenPattern.test(specifier)) {
        violations.push({
          filePath,
          sourceLayer: null,
          targetLayer: null,
          specifier,
          message: rule.message,
          ruleId: rule.id
        });
      }
    }
  }

  return violations;
}

export function analyzeLayerBoundaries({ projectRoot = process.cwd() } = {}) {
  const srcRoot = path.join(projectRoot, 'src');
  const packagesRoot = path.join(projectRoot, 'packages');
  const violations = [];

  if (!fs.existsSync(srcRoot)) {
    return { violations, fileCount: 0 };
  }

  const srcFiles = walkCodeFiles(srcRoot);
  const packageFiles = fs.existsSync(packagesRoot) ? walkCodeFiles(packagesRoot) : [];
  const allFiles = [...srcFiles, ...packageFiles];

  for (const filePath of allFiles) {
    const sourceCode = fs.readFileSync(filePath, 'utf8');
    const specifiers = getImportSpecifiers(sourceCode);

    const sourceLayer = classifyFileLayer(filePath, srcRoot);
    if (sourceLayer) {
      const forbiddenLayers = FORBIDDEN_LAYER_MAP[sourceLayer];
      if (forbiddenLayers) {
        for (const specifier of specifiers) {
          const targetLayer = resolveTargetLayer(specifier, filePath, srcRoot);
          if (!targetLayer) {
            continue;
          }

          if (forbiddenLayers.has(targetLayer)) {
            violations.push({
              filePath,
              sourceLayer,
              targetLayer,
              specifier,
              message: buildViolationMessage(sourceLayer, targetLayer)
            });
          }
        }
      }
    }

    violations.push(...checkPackageRules(filePath, specifiers));
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
      const ruleTag = violation.ruleId ? ` [${violation.ruleId}]` : '';
      console.error(`- ${relativePath}:${ruleTag} ${violation.message} (${violation.specifier})`);
    }
    process.exit(1);
  }

  console.log('Architecture boundary checks passed.');
}

const invokedScript = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedScript) {
  runCli();
}
