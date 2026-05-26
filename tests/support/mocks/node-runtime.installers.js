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

function installProcessPropertyMock(key, value) {
  const stack = createCleanupStack();
  const descriptor = Object.getOwnPropertyDescriptor(process, key);
  const hadProperty = Object.prototype.hasOwnProperty.call(process, key);
  const setValue = (nextValue) => {
    Object.defineProperty(process, key, {
      configurable: true,
      writable: true,
      value: nextValue,
    });
  };

  setValue(value);

  stack.add(() => {
    if (descriptor) {
      Object.defineProperty(process, key, descriptor);
    } else if (hadProperty) {
      Reflect.deleteProperty(process, key);
    } else {
      Reflect.deleteProperty(process, key);
    }
  });

  return {
    ...stack,
    setValue,
  };
}

function installProcessPlatformMock(platform) {
  return {
    ...installProcessPropertyMock('platform', platform),
    platform,
  };
}

function installProcessArgvMock(argv) {
  const argvValue = [...argv];

  return {
    ...installProcessPropertyMock('argv', argvValue),
    argv: argvValue,
  };
}

function installProcessRuntimeMock(options = {}) {
  const stack = createCleanupStack();
  const handle = {
    ...stack,
    platform: undefined,
    argv: undefined,
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

  return handle;
}

export {
  installProcessArgvMock,
  installProcessPlatformMock,
  installProcessRuntimeMock,
};
