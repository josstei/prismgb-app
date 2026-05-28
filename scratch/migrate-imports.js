import fs from 'fs';
import path from 'path';

const root = process.cwd();

// Helper to recursively walk a directory and return all matching files
function getFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
      getFiles(name, fileList);
    } else {
      if (['.js', '.ts', '.tsx', '.jsx'].some(ext => name.endsWith(ext))) {
        fileList.push(name);
      }
    }
  }
  return fileList;
}

const allFiles = [...getFiles(path.join(root, 'src')), ...getFiles(path.join(root, 'tests'))];

// --- DEFINE STATIC REPLACEMENTS (Regex-based) ---
const replacements = [
  // 1. Renderer Infrastructure Services (Aliased and Relative)
  { regex: /@renderer\/infrastructure\/services\/capture\/capture\.service/g, value: '@renderer/infrastructure/services/capture.service' },
  { regex: /@renderer\/infrastructure\/services\/capture\/capture-save\.service/g, value: '@renderer/infrastructure/services/capture-save.service' },
  { regex: /@renderer\/infrastructure\/services\/capture\/gpu-recording\.service/g, value: '@renderer/infrastructure/services/gpu-recording.service' },
  { regex: /@renderer\/infrastructure\/services\/devices\/device-connection\.service/g, value: '@renderer/infrastructure/services/device-connection.service' },
  { regex: /@renderer\/infrastructure\/services\/devices\/device-media\.service/g, value: '@renderer/infrastructure/services/device-media.service' },
  { regex: /@renderer\/infrastructure\/services\/devices\/device-operation-sequencer\.service/g, value: '@renderer/infrastructure/services/device-operation-sequencer.service' },
  { regex: /@renderer\/infrastructure\/services\/devices\/device-storage\.service/g, value: '@renderer/infrastructure/services/device-storage.service' },
  { regex: /@renderer\/infrastructure\/services\/devices\/device\.service/g, value: '@renderer/infrastructure/services/device.service' },
  { regex: /@renderer\/infrastructure\/services\/performance\/performance-animation\.service/g, value: '@renderer/infrastructure/services/performance-animation.service' },
  { regex: /@renderer\/infrastructure\/services\/performance\/performance-metrics\.service/g, value: '@renderer/infrastructure/services/performance-metrics.service' },
  { regex: /@renderer\/infrastructure\/services\/performance\/performance-state\.service/g, value: '@renderer/infrastructure/services/performance-state.service' },
  { regex: /@renderer\/infrastructure\/services\/settings\/cinematic-mode\.service/g, value: '@renderer/infrastructure/services/settings-cinematic-mode.service' },
  { regex: /@renderer\/infrastructure\/services\/settings\/fullscreen\.service/g, value: '@renderer/infrastructure/services/settings-fullscreen.service' },
  { regex: /@renderer\/infrastructure\/services\/settings\/presentation-mode\.service/g, value: '@renderer/infrastructure/services/settings-presentation-mode.service' },
  { regex: /@renderer\/infrastructure\/services\/settings\/settings\.service/g, value: '@renderer/infrastructure/services/settings.service' },
  { regex: /@renderer\/infrastructure\/services\/transcode\/transcode\.service/g, value: '@renderer/infrastructure/services/transcode.service' },
  { regex: /@renderer\/infrastructure\/services\/updates\/update-ui\.service/g, value: '@renderer/infrastructure/services/update-ui.service' },
  { regex: /@renderer\/infrastructure\/services\/updates\/update\.service/g, value: '@renderer/infrastructure/services/update.service' },
  
  // Renderer Infrastructure Services (Streaming Subfolder collapse)
  { regex: /@renderer\/infrastructure\/services\/streaming\/audio-pipeline\.service/g, value: '@renderer/infrastructure/services/audio-pipeline.service' },
  { regex: /@renderer\/infrastructure\/services\/streaming\/canvas-lifecycle\.service/g, value: '@renderer/infrastructure/services/canvas-lifecycle.service' },
  { regex: /@renderer\/infrastructure\/services\/streaming\/canvas-render-loop\.service/g, value: '@renderer/infrastructure/services/canvas-render-loop.service' },
  { regex: /@renderer\/infrastructure\/services\/streaming\/gpu-frame-buffer/g, value: '@renderer/infrastructure/services/gpu-frame-buffer' },
  { regex: /@renderer\/infrastructure\/services\/streaming\/gpu-render-loop\.service/g, value: '@renderer/infrastructure/services/gpu-render-loop.service' },
  { regex: /@renderer\/infrastructure\/services\/streaming\/gpu-renderer\.service/g, value: '@renderer/infrastructure/services/gpu-renderer.service' },
  { regex: /@renderer\/infrastructure\/services\/streaming\/gpu-worker-manager/g, value: '@renderer/infrastructure/services/gpu-worker-manager' },
  { regex: /@renderer\/infrastructure\/services\/streaming\/health\.service/g, value: '@renderer/infrastructure/services/health.service' },
  { regex: /@renderer\/infrastructure\/services\/streaming\/native-resolution\.utils/g, value: '@renderer/infrastructure/services/native-resolution.utils' },
  { regex: /@renderer\/infrastructure\/services\/streaming\/render-pipeline\.service/g, value: '@renderer/infrastructure/services/render-pipeline.service' },
  { regex: /@renderer\/infrastructure\/services\/streaming\/streaming-view\.service/g, value: '@renderer/infrastructure/services/streaming-view.service' },
  { regex: /@renderer\/infrastructure\/services\/streaming\/streaming\.service/g, value: '@renderer/infrastructure/services/streaming.service' },
  { regex: /@renderer\/infrastructure\/services\/streaming\/viewport\.service/g, value: '@renderer/infrastructure/services/viewport.service' },

  // 2. Renderer Infrastructure Adapters
  { regex: /@renderer\/infrastructure\/adapters\/devices\/device-ipc\.adapter/g, value: '@renderer/infrastructure/adapters/device-ipc.adapter' },
  { regex: /@renderer\/infrastructure\/adapters\/devices\/device-change-debounce\.adapter/g, value: '@renderer/infrastructure/adapters/device-change-debounce.adapter' },
  { regex: /@renderer\/infrastructure\/adapters\/devices\/device-ipc-status\.adapter/g, value: '@renderer/infrastructure/adapters/device-ipc-status.adapter' },
  { regex: /@renderer\/infrastructure\/adapters\/devices\/chromatic\/chromatic\.adapter/g, value: '@renderer/infrastructure/adapters/device-chromatic.adapter' },
  { regex: /@renderer\/infrastructure\/adapters\/devices\/device-base\.adapter/g, value: '@renderer/infrastructure/adapters/device-base.adapter' },
  { regex: /@renderer\/infrastructure\/adapters\/platform\/metrics\.adapter/g, value: '@renderer/infrastructure/adapters/platform-metrics.adapter' },
  { regex: /@renderer\/infrastructure\/adapters\/streaming\/gpu-renderer\.adapter/g, value: '@renderer/infrastructure/adapters/streaming-gpu-renderer.adapter' },
  { regex: /@renderer\/infrastructure\/adapters\/streaming\/canvas2d-renderer\.adapter/g, value: '@renderer/infrastructure/adapters/streaming-canvas2d-renderer.adapter' },
  { regex: /@renderer\/infrastructure\/adapters\/streaming\/streaming-renderer\.interface/g, value: '@renderer/infrastructure/adapters/streaming-renderer.interface' },

  // 3. UI Presentation Features
  { regex: /@renderer\/presentation\/features\/notes\/components\//g, value: '@renderer/presentation/features/notes/' },
  { regex: /@renderer\/presentation\/features\/toolbar\/components\//g, value: '@renderer/presentation/features/toolbar/' },

  // 4. Main Process Infrastructure
  { regex: /@main\/infrastructure\/devices\/device\.service/g, value: '@main/infrastructure/device.service' },
  { regex: /@main\/infrastructure\/devices\/device-profile\.registry/g, value: '@main/infrastructure/device-profile.registry' },
  { regex: /@main\/infrastructure\/devices\/usb-device-monitor/g, value: '@main/infrastructure/usb-device-monitor' },
  { regex: /@main\/infrastructure\/events\/event-channels\.config/g, value: '@main/infrastructure/event-channels.config' },
  { regex: /@main\/infrastructure\/logging\/logger\.service/g, value: '@main/infrastructure/logger.service' },
  { regex: /@main\/infrastructure\/platform\/login-item\.service/g, value: '@main/infrastructure/login-item.service' },
  { regex: /@main\/infrastructure\/transcode\/transcode\.service/g, value: '@main/infrastructure/transcode.service' },
  { regex: /@main\/infrastructure\/tray\/tray\.service/g, value: '@main/infrastructure/tray.service' },
  { regex: /@main\/infrastructure\/window\/window\.service/g, value: '@main/infrastructure/window.service' },
  { regex: /@main\/infrastructure\/devices\/device-bridge\.service/g, value: '@main/infrastructure/device-bridge.service' },
  { regex: /@main\/infrastructure\/devices\/device-lifecycle\.service/g, value: '@main/infrastructure/device-lifecycle.service' },
  { regex: /@main\/infrastructure\/events\/event-bus/g, value: '@main/infrastructure/event-bus' },
  { regex: /@main\/infrastructure\/logging\/logger\.factory/g, value: '@main/infrastructure/logger.factory' },
  { regex: /@main\/infrastructure\/logging\/logger\.interface/g, value: '@main/infrastructure/logger.interface' },
  { regex: /@main\/infrastructure\/platform\/gpu-policy/g, value: '@main/infrastructure/gpu-policy' },
  { regex: /@main\/infrastructure\/transcode\/ffmpeg-path\.utils/g, value: '@main/infrastructure/ffmpeg-path.utils' },
  { regex: /@main\/infrastructure\/transcode\/transcode-process/g, value: '@main/infrastructure/transcode-process' },
  { regex: /@main\/infrastructure\/transcode\/transcode-temp\.utils/g, value: '@main/infrastructure/transcode-temp.utils' },

  // General relative matching for deep imports
  { regex: /infrastructure\/services\/capture\/capture\.service/g, value: 'infrastructure/services/capture.service' },
  { regex: /infrastructure\/services\/capture\/capture-save\.service/g, value: 'infrastructure/services/capture-save.service' },
  { regex: /infrastructure\/services\/capture\/gpu-recording\.service/g, value: 'infrastructure/services/gpu-recording.service' },
  { regex: /infrastructure\/services\/devices\/device-connection\.service/g, value: 'infrastructure/services/device-connection.service' },
  { regex: /infrastructure\/services\/devices\/device-media\.service/g, value: 'infrastructure/services/device-media.service' },
  { regex: /infrastructure\/services\/devices\/device-operation-sequencer\.service/g, value: 'infrastructure/services/device-operation-sequencer.service' },
  { regex: /infrastructure\/services\/devices\/device-storage\.service/g, value: 'infrastructure/services/device-storage.service' },
  { regex: /infrastructure\/services\/devices\/device\.service/g, value: 'infrastructure/services/device.service' },
  { regex: /infrastructure\/services\/performance\/performance-animation\.service/g, value: 'infrastructure/services/performance-animation.service' },
  { regex: /infrastructure\/services\/performance\/performance-metrics\.service/g, value: 'infrastructure/services/performance-metrics.service' },
  { regex: /infrastructure\/services\/performance\/performance-state\.service/g, value: 'infrastructure/services/performance-state.service' },
  { regex: /infrastructure\/services\/settings\/cinematic-mode\.service/g, value: 'infrastructure/services/settings-cinematic-mode.service' },
  { regex: /infrastructure\/services\/settings\/fullscreen\.service/g, value: 'infrastructure/services/settings-fullscreen.service' },
  { regex: /infrastructure\/services\/settings\/presentation-mode\.service/g, value: 'infrastructure/services/settings-presentation-mode.service' },
  { regex: /infrastructure\/services\/settings\/settings\.service/g, value: 'infrastructure/services/settings.service' },
  { regex: /infrastructure\/services\/transcode\/transcode\.service/g, value: 'infrastructure/services/transcode.service' },
  { regex: /infrastructure\/services\/updates\/update-ui\.service/g, value: 'infrastructure/services/update-ui.service' },
  { regex: /infrastructure\/services\/updates\/update\.service/g, value: 'infrastructure/services/update.service' },
  { regex: /infrastructure\/services\/streaming\//g, value: 'infrastructure/services/' },
  
  { regex: /infrastructure\/adapters\/devices\/device-ipc\.adapter/g, value: 'infrastructure/adapters/device-ipc.adapter' },
  { regex: /infrastructure\/adapters\/devices\/device-change-debounce\.adapter/g, value: 'infrastructure/adapters/device-change-debounce.adapter' },
  { regex: /infrastructure\/adapters\/devices\/device-ipc-status\.adapter/g, value: 'infrastructure/adapters/device-ipc-status.adapter' },
  { regex: /infrastructure\/adapters\/devices\/chromatic\/chromatic\.adapter/g, value: 'infrastructure/adapters/device-chromatic.adapter' },
  { regex: /infrastructure\/adapters\/devices\/device-base\.adapter/g, value: 'infrastructure/adapters/device-base.adapter' },
  { regex: /infrastructure\/adapters\/platform\/metrics\.adapter/g, value: 'infrastructure/adapters/platform-metrics.adapter' },
  { regex: /infrastructure\/adapters\/streaming\/gpu-renderer\.adapter/g, value: 'infrastructure/adapters/streaming-gpu-renderer.adapter' },
  { regex: /infrastructure\/adapters\/streaming\/canvas2d-renderer\.adapter/g, value: 'infrastructure/adapters/streaming-canvas2d-renderer.adapter' },
  { regex: /infrastructure\/adapters\/streaming\/streaming-renderer\.interface/g, value: 'infrastructure/adapters/streaming-renderer.interface' },

  { regex: /presentation\/features\/notes\/components\//g, value: 'presentation/features/notes/' },
  { regex: /presentation\/features\/toolbar\/components\//g, value: 'presentation/features/toolbar/' },

  { regex: /main\/infrastructure\/devices\/device\.service/g, value: 'main/infrastructure/device.service' },
  { regex: /main\/infrastructure\/devices\/device-profile\.registry/g, value: 'main/infrastructure/device-profile.registry' },
  { regex: /main\/infrastructure\/devices\/usb-device-monitor/g, value: 'main/infrastructure/usb-device-monitor' },
  { regex: /main\/infrastructure\/events\/event-channels\.config/g, value: 'main/infrastructure/event-channels.config' },
  { regex: /main\/infrastructure\/logging\/logger\.service/g, value: 'main/infrastructure/logger.service' },
  { regex: /main\/infrastructure\/platform\/login-item\.service/g, value: 'main/infrastructure/login-item.service' },
  { regex: /main\/infrastructure\/transcode\/transcode\.service/g, value: 'main/infrastructure/transcode.service' },
  { regex: /main\/infrastructure\/tray\/tray\.service/g, value: 'main/infrastructure/tray.service' },
  { regex: /main\/infrastructure\/window\/window\.service/g, value: 'main/infrastructure/window.service' },
  { regex: /main\/infrastructure\/devices\/device-bridge\.service/g, value: 'main/infrastructure/device-bridge.service' },
  { regex: /main\/infrastructure\/devices\/device-lifecycle\.service/g, value: 'main/infrastructure/device-lifecycle.service' },
  { regex: /main\/infrastructure\/events\/event-bus/g, value: 'main/infrastructure/event-bus' },
  { regex: /main\/infrastructure\/logging\/logger\.factory/g, value: 'main/infrastructure/logger.factory' },
  { regex: /main\/infrastructure\/logging\/logger\.interface/g, value: 'main/infrastructure/logger.interface' },
  { regex: /main\/infrastructure\/platform\/gpu-policy/g, value: 'main/infrastructure/gpu-policy' },
  { regex: /main\/infrastructure\/transcode\/ffmpeg-path\.utils/g, value: 'main/infrastructure/ffmpeg-path.utils' },
  { regex: /main\/infrastructure\/transcode\/transcode-process/g, value: 'main/infrastructure/transcode-process' },
  { regex: /main\/infrastructure\/transcode\/transcode-temp\.utils/g, value: 'main/infrastructure/transcode-temp.utils' },

  // Redundant app layer test reference adjustments
  { regex: /tests\/unit\/app\/main\/ipc-handler\.registry\.test\.js/g, value: 'tests/unit/main/ipc-handler.registry.test.ts' },
  { regex: /tests\/unit\/app\/renderer\/container\.test\.js/g, value: 'tests/unit/renderer/application/container.test.ts' }
];

async function run() {
  console.log(`[Imports] Scanning and rewriting imports in ${allFiles.length} files...`);

  for (const filePath of allFiles) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // Apply static mappings
    for (const rep of replacements) {
      content = content.replace(rep.regex, rep.value);
    }

    // Apply relative import collapsing inside the newly flattened directories themselves!
    // E.g., if a file is in src/renderer/infrastructure/services/, relative imports like '../devices/device-storage.service.js' -> './device-storage.service.js'
    const isService = filePath.includes('src/renderer/infrastructure/services') || filePath.includes('tests/unit/renderer/infrastructure/services');
    const isAdapter = filePath.includes('src/renderer/infrastructure/adapters') || filePath.includes('tests/unit/renderer/infrastructure/adapters');
    const isMainInfra = filePath.includes('src/main/infrastructure') || filePath.includes('tests/unit/main/infrastructure');
    
    if (isService || isAdapter || isMainInfra) {
      // replace intra-directory jumping: '../[capture|devices|performance|settings|streaming|transcode|updates|platform|events|logging]/[file]' -> './[file]'
      content = content.replace(/\.\.\/(capture|devices|performance|settings|streaming|transcode|updates|platform|events|logging)\//g, './');
    }

    // Convert import statements containing .test.js references to .test.ts
    content = content.replace(/test\.js/g, 'test.js'); // keep regular imports as-is unless they are test files
    // Specific test references in factories, mocks, or other test files
    content = content.replace(/\.test\.js(['"])/g, '.test.ts$1');

    if (content !== original) {
      fs.writeFileSync(filePath, content);
      console.log(`[Updated] ${path.relative(root, filePath)}`);
    }
  }

  console.log('[Imports] System-wide import alignment successfully completed.');
}

run();
