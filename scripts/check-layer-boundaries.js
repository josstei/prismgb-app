#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const projectRoot = process.cwd();
const srcRoot = path.join(projectRoot, 'src');
const rendererInfraRoot = path.join(srcRoot, 'renderer', 'infrastructure');
const rendererPresentationRoot = path.join(srcRoot, 'renderer', 'presentation');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }

    if (entry.isFile() && (fullPath.endsWith('.js') || fullPath.endsWith('.ts'))) {
      files.push(fullPath);
    }
  }
  return files;
}

function getImportSpecifiers(source) {
  const specs = [];

  for (const match of source.matchAll(/(?:import|export)\s+[\s\S]*?from\s*['"]([^'"]+)['"]/g)) {
    specs.push(match[1]);
  }

  for (const match of source.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    specs.push(match[1]);
  }

  return specs;
}

function isDisallowedInfraImport(specifier) {
  return specifier === '@renderer/presentation/config/constants.config'
    || specifier === '@renderer/presentation/config/constants.config.ts';
}

function resolveRelativeImport(filePath, specifier) {
  if (!specifier.startsWith('.')) {
    return null;
  }

  const base = path.dirname(filePath);
  return path.resolve(base, specifier);
}

function isMainImport(specifier, filePath) {
  if (specifier.startsWith('@main/')) {
    return true;
  }

  const resolved = resolveRelativeImport(filePath, specifier);
  return Boolean(resolved && resolved.includes(`${path.sep}src${path.sep}main${path.sep}`));
}

const violations = [];

if (fs.existsSync(rendererInfraRoot)) {
  for (const filePath of walk(rendererInfraRoot)) {
    const source = fs.readFileSync(filePath, 'utf8');
    for (const specifier of getImportSpecifiers(source)) {
      if (isDisallowedInfraImport(specifier)) {
        violations.push({
          filePath,
          specifier,
          message: 'Renderer infrastructure cannot import presentation timing config.'
        });
      }
    }
  }
}

if (fs.existsSync(rendererPresentationRoot)) {
  for (const filePath of walk(rendererPresentationRoot)) {
    const source = fs.readFileSync(filePath, 'utf8');
    for (const specifier of getImportSpecifiers(source)) {
      if (isMainImport(specifier, filePath)) {
        violations.push({
          filePath,
          specifier,
          message: 'Renderer presentation cannot import main-process internals.'
        });
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Architecture boundary violations:');
  for (const violation of violations) {
    const relPath = path.relative(projectRoot, violation.filePath);
    console.error(`- ${relPath}: ${violation.message} (${violation.specifier})`);
  }
  process.exit(1);
}

console.log('Architecture boundary checks passed.');
