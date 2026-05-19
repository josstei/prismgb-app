export function parseFlagArgs(argv, optionSpecs = {}) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      continue;
    }

    const key = arg.slice(2);
    const spec = optionSpecs[key] || {};

    if (spec.boolean) {
      options[key] = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }

    options[key] = value;
    index += 1;
  }

  return options;
}

export function fail(message, exitCode = 1) {
  console.error(message);
  process.exit(exitCode);
}

