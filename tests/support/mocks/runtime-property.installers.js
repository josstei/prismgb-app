// @ts-nocheck
function createCleanupStack() {
  const cleanups = [];

  return {
    add(cleanup) {
      cleanups.push(cleanup);
    },
    cleanup() {
      while (cleanups.length > 0) {
        cleanups.pop()();
      }
    },
  };
}

function installTargetProperty(target, key, value) {
  const stack = createCleanupStack();
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  const setValue = (nextValue) => Object.defineProperty(target, key, {
    configurable: true,
    writable: true,
    value: nextValue,
  });

  setValue(value);

  stack.add(() => {
    if (descriptor) {
      Object.defineProperty(target, key, descriptor);
    } else {
      Reflect.deleteProperty(target, key);
    }
  });

  return {
    ...stack,
    setValue,
  };
}

function installProcessPlatformMock(platform) {
  return {
    ...installTargetProperty(process, 'platform', platform),
    platform,
  };
}

function installProcessArgvMock(argv) {
  const argvValue = [...argv];

  return {
    ...installTargetProperty(process, 'argv', argvValue),
    argv: argvValue,
  };
}

function createProcessEnvValue(overrides = {}, baseEnv = process.env) {
  const env = { ...baseEnv };

  Object.entries(overrides).forEach(([key, value]) => {
    if (value === undefined) {
      delete env[key];
      return;
    }

    env[key] = String(value);
  });

  return env;
}

function installProcessEnvMock(overrides = {}) {
  const envValue = createProcessEnvValue(overrides);
  const propertyHandle = installTargetProperty(process, 'env', envValue);
  const handle = {
    ...propertyHandle,
    env: envValue,
  };

  handle.setEnv = (nextOverrides = {}) => {
    const nextEnv = createProcessEnvValue(nextOverrides);
    propertyHandle.setValue(nextEnv);
    handle.env = nextEnv;
    return nextEnv;
  };

  handle.setValue = (nextValue) => {
    const nextEnv = createProcessEnvValue(nextValue, {});
    propertyHandle.setValue(nextEnv);
    handle.env = nextEnv;
    return nextEnv;
  };

  return handle;
}

function installProcessRuntimeMock(options = {}) {
  const stack = createCleanupStack();
  const handle = {
    ...stack,
    platform: undefined,
    argv: undefined,
    env: undefined,
  };

  if (Object.prototype.hasOwnProperty.call(options, 'platform')) {
    const platformMock = installProcessPlatformMock(options.platform);
    handle.platform = platformMock.platform;
    handle.setPlatform = platformMock.setValue;
    stack.add(() => platformMock.cleanup());
  }

  if (Object.prototype.hasOwnProperty.call(options, 'argv')) {
    const argvMock = installProcessArgvMock(options.argv);
    handle.argv = argvMock.argv;
    handle.setArgv = argvMock.setValue;
    stack.add(() => argvMock.cleanup());
  }

  if (Object.prototype.hasOwnProperty.call(options, 'env')) {
    const envMock = installProcessEnvMock(options.env);
    handle.env = envMock.env;
    handle.setEnv = (nextOverrides = {}) => {
      const nextEnv = envMock.setEnv(nextOverrides);
      handle.env = nextEnv;
      return nextEnv;
    };
    stack.add(() => envMock.cleanup());
  }

  return handle;
}

export {
  createCleanupStack,
  installProcessEnvMock,
  installTargetProperty,
  installProcessArgvMock,
  installProcessPlatformMock,
  installProcessRuntimeMock,
};
