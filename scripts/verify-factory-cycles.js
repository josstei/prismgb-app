/**
 * Static Circular Dependency Detector for Split Factories
 * Parses ESM import statements to build a dependency graph and check for cycles using DFS.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const FILES_TO_CHECK = [
  'tests/factories/index.js',
  'tests/factories/system.factory.js',
  'tests/factories/settings.factory.js',
  'tests/factories/update.factory.js',
  'tests/factories/window.factory.js',
  'tests/factories/performance.factory.js',
  'tests/factories/device.factory.js',
  'tests/factories/stream.factory.js',
  'tests/factories/capture.factory.js',
  'tests/factories/streaming-pipeline.factory.js',
  'tests/factories/ui.factory.js',
  'tests/factories/orchestrator.factory.js',
  'tests/factories/dependencies.factory.js',
  'tests/support/mocks/browser-api.installers.js'
];

// Add installers dynamically if they exist
const installersDir = path.join(ROOT, 'tests/support/mocks/installers');
if (fs.existsSync(installersDir)) {
  const installers = fs.readdirSync(installersDir)
    .filter(f => f.endsWith('.js'))
    .map(f => `tests/support/mocks/installers/${f}`);
  FILES_TO_CHECK.push(...installers);
}

const graph = {};

function parseImports(filePath) {
  const absolutePath = path.join(ROOT, filePath);
  if (!fs.existsSync(absolutePath)) return [];
  const content = fs.readFileSync(absolutePath, 'utf8');
  const imports = [];
  
  // Match relative ESM imports: import { ... } from './some.file.js'
  const importRegex = /from\s+['"](\.\.?\/[^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    const resolved = path.join(path.dirname(filePath), importPath);
    // Normalize path to match relative root path
    const normalized = path.relative(ROOT, resolved).replace(/\\/g, '/');
    imports.push(normalized);
  }
  return imports;
}

// Build Graph
for (const file of FILES_TO_CHECK) {
  const normFile = file.replace(/\\/g, '/');
  graph[normFile] = parseImports(file);
}

// Cycle Detection using DFS (color-based)
const visited = {}; // 0 = unvisited, 1 = visiting, 2 = visited
let hasCycle = false;
const cycles = [];

function dfs(node, pathStack = []) {
  visited[node] = 1;
  pathStack.push(node);

  const neighbors = graph[node] || [];
  for (const neighbor of neighbors) {
    if (visited[neighbor] === 1) {
      hasCycle = true;
      const cycleStartIdx = pathStack.indexOf(neighbor);
      const cyclePath = pathStack.slice(cycleStartIdx).concat(neighbor);
      cycles.push(cyclePath.join(' -> '));
    } else if (!visited[neighbor]) {
      dfs(neighbor, pathStack);
    }
  }

  pathStack.pop();
  visited[node] = 2;
}

for (const node in graph) {
  if (!visited[node]) {
    dfs(node);
  }
}

if (hasCycle) {
  console.error('\x1b[31m❌ Circular dependencies detected in test split:\x1b[0m');
  cycles.forEach(c => console.error(`  ${c}`));
  process.exit(1);
} else {
  console.log('\x1b[32m✅ No circular dependencies detected in factory/installer split.\x1b[0m');
  process.exit(0);
}
