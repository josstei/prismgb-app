import fs from 'fs';
import path from 'path';

const root = process.cwd();

const sourceMoves = [
  // Main process nested files
  { from: 'src/main/infrastructure/devices/device-bridge.service.ts', to: 'src/main/infrastructure/device-bridge.service.ts' },
  { from: 'src/main/infrastructure/devices/device-lifecycle.service.ts', to: 'src/main/infrastructure/device-lifecycle.service.ts' },
  { from: 'src/main/infrastructure/events/event-bus.ts', to: 'src/main/infrastructure/event-bus.ts' },
  { from: 'src/main/infrastructure/logging/logger.factory.ts', to: 'src/main/infrastructure/logger.factory.ts' },
  { from: 'src/main/infrastructure/logging/logger.interface.ts', to: 'src/main/infrastructure/logger.interface.ts' },
  { from: 'src/main/infrastructure/platform/gpu-policy.ts', to: 'src/main/infrastructure/gpu-policy.ts' },
  { from: 'src/main/infrastructure/transcode/ffmpeg-path.utils.ts', to: 'src/main/infrastructure/ffmpeg-path.utils.ts' },
  { from: 'src/main/infrastructure/transcode/transcode-process.ts', to: 'src/main/infrastructure/transcode-process.ts' },
  { from: 'src/main/infrastructure/transcode/transcode-temp.utils.ts', to: 'src/main/infrastructure/transcode-temp.utils.ts' },
  
  // Renderer base adapters / interfaces
  { from: 'src/renderer/infrastructure/adapters/devices/device-base.adapter.ts', to: 'src/renderer/infrastructure/adapters/device-base.adapter.ts' },
  { from: 'src/renderer/infrastructure/adapters/streaming/streaming-renderer.interface.ts', to: 'src/renderer/infrastructure/adapters/streaming-renderer.interface.ts' }
];

const testMoves = [
  // Updates main process test
  { from: 'tests/unit/features/updates/main/update.service.test.js', to: 'tests/unit/main/update.service.test.ts' },
  
  // Streaming infrastructure tests
  { from: 'tests/unit/features/streaming/factories/adapter.factory.test.js', to: 'tests/unit/renderer/infrastructure/factories/streaming-adapter.factory.test.ts' },
  { from: 'tests/unit/features/streaming/rendering/gpu-render-loop.service.test.js', to: 'tests/unit/renderer/infrastructure/services/gpu-render-loop.service.test.ts' },
  { from: 'tests/unit/features/streaming/rendering/render-pipeline.service.test.js', to: 'tests/unit/renderer/infrastructure/services/render-pipeline.service.test.ts' },
  { from: 'tests/unit/features/streaming/rendering/stream-health.service.test.js', to: 'tests/unit/renderer/infrastructure/services/stream-health.service.test.ts' },
  { from: 'tests/unit/features/streaming/rendering/viewport.service.test.js', to: 'tests/unit/renderer/infrastructure/services/viewport.service.test.ts' },
  { from: 'tests/unit/features/streaming/rendering/managers/gpu-worker-manager.class.test.js', to: 'tests/unit/renderer/infrastructure/services/gpu-worker-manager.test.ts' },

  // UI / Presentation component tests
  { from: 'tests/unit/ui/components/device-status.test.js', to: 'tests/unit/renderer/presentation/components/device-status.test.ts' },
  { from: 'tests/unit/ui/components/shader-selector.test.js', to: 'tests/unit/renderer/presentation/components/shader-selector.test.ts' },
  { from: 'tests/unit/ui/components/stream-controls.test.js', to: 'tests/unit/renderer/presentation/components/stream-controls.test.ts' },
  { from: 'tests/unit/ui/components/transcode-toast.component.test.js', to: 'tests/unit/renderer/presentation/components/transcode-toast.component.test.ts' },
  { from: 'tests/unit/ui/features/toolbar/effects/toolbar-auto-hide.test.js', to: 'tests/unit/renderer/presentation/features/toolbar/toolbar-auto-hide.test.ts' },
  
  // UI orchestration, app states, and effects tests
  { from: 'tests/unit/ui/app.state.test.js', to: 'tests/unit/renderer/application/state/app-state.test.ts' },
  { from: 'tests/unit/ui/body-class.manager.test.js', to: 'tests/unit/renderer/presentation/effects/body-class.manager.test.ts' },
  { from: 'tests/unit/ui/effects.test.js', to: 'tests/unit/renderer/presentation/effects/effects.test.ts' },
  { from: 'tests/unit/ui/ui-effects.test.js', to: 'tests/unit/renderer/presentation/effects/ui-effects.test.ts' },
  { from: 'tests/unit/ui/ui-setup.orchestrator.test.js', to: 'tests/unit/renderer/application/orchestrators/ui-setup.orchestrator.test.ts' },
  { from: 'tests/unit/ui/ui.controller.test.js', to: 'tests/unit/renderer/presentation/controller/ui.controller.test.ts' },
  
  // UI primitives tests
  { from: 'tests/unit/ui/primitives/disclosure.test.js', to: 'tests/unit/renderer/presentation/primitives/disclosure.test.ts' },
  { from: 'tests/unit/ui/primitives/listbox-dropdown.test.js', to: 'tests/unit/renderer/presentation/primitives/listbox-dropdown.test.ts' }
];

const moves = [...sourceMoves, ...testMoves];

async function run() {
  console.log('[Migration] Starting secondary relocations...');
  for (const move of moves) {
    const fromPath = path.join(root, move.from);
    const toPath = path.join(root, move.to);
    
    if (fs.existsSync(fromPath)) {
      const destDir = path.dirname(toPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.renameSync(fromPath, toPath);
      console.log(`[Move] ${move.from} -> ${move.to}`);
    } else {
      console.warn(`[Skip] Source file not found: ${move.from}`);
    }
  }

  // Clear newly emptied directories
  const directoriesToClean = [
    'src/renderer/infrastructure/adapters/devices',
    'src/renderer/infrastructure/adapters/platform',
    'src/renderer/infrastructure/adapters/streaming',
    'src/main/infrastructure/devices',
    'src/main/infrastructure/events',
    'src/main/infrastructure/logging',
    'src/main/infrastructure/platform',
    'src/main/infrastructure/transcode',
    'tests/unit/features/streaming/factories',
    'tests/unit/features/streaming/rendering/managers',
    'tests/unit/features/streaming/rendering',
    'tests/unit/features/streaming',
    'tests/unit/features/updates/main',
    'tests/unit/features/updates',
    'tests/unit/features',
    'tests/unit/ui/components',
    'tests/unit/ui/features/toolbar/effects',
    'tests/unit/ui/features/toolbar',
    'tests/unit/ui/features',
    'tests/unit/ui/primitives',
    'tests/unit/ui'
  ];

  for (const dir of directoriesToClean) {
    const dirPath = path.join(root, dir);
    if (fs.existsSync(dirPath)) {
      try {
        const files = fs.readdirSync(dirPath);
        if (files.length === 0) {
          fs.rmdirSync(dirPath);
          console.log(`[Clean] Deleted empty directory: ${dir}`);
        } else {
          console.warn(`[Clean] Directory not empty, skipping delete: ${dir} (contains ${files.join(', ')})`);
        }
      } catch (err) {
        // ignore
      }
    }
  }

  console.log('[Migration] Secondary structural relocations successfully completed.');
}

run();
