#!/usr/bin/env node

const args = process.argv.slice(2);

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      continue;
    }
    const key = arg.slice(2);
    const value = argv[i + 1];
    parsed[key] = value;
    i += 1;
  }
  return parsed;
}

const options = parseArgs(args);
const mode = options.mode;

const entries = {
  linuxX64: {
    os: 'ubuntu-latest',
    build_script: 'build:linux',
    arch: 'x64',
    name: 'Linux x64',
    label: 'linux-x64'
  },
  macosX64: {
    os: 'macos-15-intel',
    build_script: 'build:mac',
    arch: 'x64',
    name: 'macOS x64',
    label: 'macos-x64'
  },
  macosArm64: {
    os: 'macos-14',
    build_script: 'build:mac',
    arch: 'arm64',
    name: 'macOS ARM64',
    label: 'macos-arm64'
  },
  windowsX64: {
    os: 'windows-latest',
    build_script: 'build:win',
    arch: 'x64',
    name: 'Windows x64',
    label: 'windows-x64'
  }
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!mode) {
  fail('Missing required --mode argument (release|smoke).');
}

let matrix = [];

if (mode === 'release') {
  const platforms = (options.platforms || 'all').toLowerCase();
  switch (platforms) {
    case 'all':
      matrix = [entries.linuxX64, entries.macosX64, entries.macosArm64, entries.windowsX64];
      break;
    case 'linux':
      matrix = [entries.linuxX64];
      break;
    case 'macos':
      matrix = [entries.macosX64, entries.macosArm64];
      break;
    case 'windows':
      matrix = [entries.windowsX64];
      break;
    default:
      fail(`Unsupported platforms value: ${platforms}`);
  }
} else if (mode === 'smoke') {
  const platform = (options.platform || 'all').toLowerCase();
  switch (platform) {
    case 'all':
      matrix = [entries.linuxX64, entries.macosX64, entries.macosArm64, entries.windowsX64];
      break;
    case 'linux-x64':
      matrix = [entries.linuxX64];
      break;
    case 'macos-x64':
      matrix = [entries.macosX64];
      break;
    case 'macos-arm64':
      matrix = [entries.macosArm64];
      break;
    case 'windows':
      matrix = [entries.windowsX64];
      break;
    default:
      fail(`Unsupported platform value: ${platform}`);
  }
} else {
  fail(`Unsupported mode: ${mode}`);
}

process.stdout.write(JSON.stringify(matrix));
