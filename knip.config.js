import { PLATFORM_MODULES, PLATFORM_ROOT, platformTsconfigPaths } from './scripts/lib/workspace-aliases.mjs';

const testkitPaths = PLATFORM_MODULES
  .filter((module) => './testkit' in module.entrypoints)
  .flatMap((module) => [
    `${PLATFORM_ROOT}/${module.name}/${module.entrypoints['./testkit']}`,
    `${PLATFORM_ROOT}/${module.name}/testkit/**`
  ]);

export default ({ production }) => ({
  // Both graphs check files, exports, types and dependencies. The full graph also
  // follows tests; production excludes only declared testkit surfaces so test
  // imports cannot hide unused runtime APIs. Unit tests may import internal
  // implementations directly without expanding public application entrypoints.
  includeEntryExports: true,
  ignoreExportsUsedInFile: true,
  workspaces: {
    '.': {
      entry: [
        'src/main/index.ts!',
        'src/preload/index.ts!',
        'src/renderer/index.ts!',
        'src/platform/gpu/worker-entry.ts!',
        'tests/**/*.{test,spec}.{js,ts}',
        // Electron Builder loads these defaults from package.json hook paths.
        'scripts/afterPack.js',
        'scripts/patch-appimage-runtime.js'
      ],
      project: [
        'src/**/*.{ts,js}!',
        'scripts/**/*.{js,mjs}',
        'tests/**/*.{ts,js}',
        '*.{js,mjs}',
        '!tests/fixtures/**',
        '!tests/e2e/.generated/**',
        '!tests/e2e/test-results/**',
        ...(production ? testkitPaths.map((entry) => `!${entry}!`) : [])
      ],
      paths: platformTsconfigPaths(),
      // Electron is a development tool used to launch the packaged production entry.
      ignoreBinaries: production ? ['electron'] : [],
      ignoreDependencies: ['@electron/notarize']
    }
  }
});
