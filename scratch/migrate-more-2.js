import fs from 'fs';
import path from 'path';

const root = process.cwd();

const testMoves = [
  { from: 'tests/unit/features/streaming/services/streaming.orchestrator.test.js', to: 'tests/unit/renderer/application/orchestrators/streaming.orchestrator.test.ts' },
  { from: 'tests/unit/features/streaming/services/streaming.service.test.js', to: 'tests/unit/renderer/infrastructure/services/streaming.service.test.ts' },
  { from: 'tests/unit/features/streaming/services/stream-view.service.test.js', to: 'tests/unit/renderer/infrastructure/services/streaming-view.service.test.ts' },
  { from: 'tests/unit/features/streaming/services/streaming-audio.orchestrator.test.js', to: 'tests/unit/renderer/application/orchestrators/streaming-audio.orchestrator.test.ts' },
  
  { from: 'tests/unit/ui/features/streaming/effects/cursor-auto-hide.test.js', to: 'tests/unit/renderer/presentation/features/toolbar/cursor-auto-hide.test.ts' },
  { from: 'tests/unit/ui/features/fullscreen/effects/controls-auto-hide.test.js', to: 'tests/unit/renderer/presentation/features/toolbar/controls-auto-hide.test.ts' }
];

async function run() {
  console.log('[Migration] Moving last 6 test files...');
  for (const move of testMoves) {
    const fromPath = path.join(root, move.from);
    const toPath = path.join(root, move.to);
    
    if (fs.existsSync(fromPath)) {
      const destDir = path.dirname(toPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.renameSync(fromPath, toPath);
      console.log(`[Move] ${move.from} -> ${move.to}`);
    }
  }

  // Delete newly emptied folders
  const dirs = [
    'tests/unit/features/streaming/services',
    'tests/unit/features/streaming',
    'tests/unit/features',
    'tests/unit/ui/features/streaming/effects',
    'tests/unit/ui/features/streaming',
    'tests/unit/ui/features/fullscreen/effects',
    'tests/unit/ui/features/fullscreen',
    'tests/unit/ui/features',
    'tests/unit/ui'
  ];

  for (const dir of dirs) {
    const dirPath = path.join(root, dir);
    if (fs.existsSync(dirPath)) {
      try {
        const files = fs.readdirSync(dirPath);
        if (files.length === 0) {
          fs.rmdirSync(dirPath);
          console.log(`[Clean] Deleted empty directory: ${dir}`);
        }
      } catch (err) {}
    }
  }
}

run();
