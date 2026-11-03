import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { platformTsconfigPaths } from './lib/workspace-aliases.mjs';

const outputPath = fileURLToPath(new URL('../tsconfig.paths.generated.json', import.meta.url));

export function workspacePathsConfig() {
  return {
    compilerOptions: {
      paths: {
        '@main/*': ['./src/main/*'],
        '@renderer/*': ['./src/renderer/*'],
        ...platformTsconfigPaths()
      }
    }
  };
}

export async function generateWorkspacePaths({ check = false, output = outputPath } = {}) {
  const expected = `${JSON.stringify(workspacePathsConfig(), null, 2)}\n`;
  if (check) {
    const actual = await readFile(output, 'utf8').catch(() => null);
    if (actual !== expected) {
      throw new Error('Workspace paths are stale. Run npm run generate:paths and commit tsconfig.paths.generated.json.');
    }
    return;
  }
  await writeFile(output, expected);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateWorkspacePaths({ check: process.argv.includes('--check') });
}
