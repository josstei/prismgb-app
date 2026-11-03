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
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  const setValue = (nextValue) => Object.defineProperty(target, key, {
    configurable: true,
    writable: true,
    value: nextValue,
  });
  setValue(value);

  return {
    setValue,
    cleanup() {
      if (descriptor) Object.defineProperty(target, key, descriptor);
      else Reflect.deleteProperty(target, key);
    },
  };
}

export { createCleanupStack, installTargetProperty };
