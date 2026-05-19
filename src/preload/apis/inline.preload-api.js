function createInvokeMethod({
  channel,
  ipcRenderer,
  validateArgs = () => true,
  invalidArgMessage,
  fallback
}) {
  return (...args) => {
    if (!validateArgs(...args)) {
      if (invalidArgMessage) {
        console.warn(invalidArgMessage);
      }
      return Promise.resolve(fallback);
    }

    return ipcRenderer.invoke(channel, ...args);
  };
}

function createResponseFallbackInvoker({
  apiName,
  methodName,
  channel,
  ipcRenderer,
  fallback,
  onFailure,
  onInvalid,
  onSuccess
}) {
  return async () => {
    try {
      const result = await ipcRenderer.invoke(channel);
      if (onFailure && !onFailure(result)) {
        return fallback;
      }
      if (onInvalid && !onInvalid(result)) {
        return fallback;
      }
      return onSuccess ? onSuccess(result) : result;
    } catch (error) {
      console.warn(`${apiName}.${methodName}: IPC error:`, error);
      return fallback;
    }
  };
}

function createGpuPolicyInvoker({ apiName, ipcRenderer, channel, isValidGpuPolicy }) {
  return createResponseFallbackInvoker({
    apiName,
    methodName: 'getPolicy',
    channel,
    ipcRenderer,
    onFailure: (result) => {
      if (!result?.success) {
        console.warn('gpuAPI.getPolicy: Failed to get policy:', result?.error);
        return false;
      }
      return true;
    },
    onInvalid: (result) => {
      if (!isValidGpuPolicy(result)) {
        console.warn('gpuAPI.getPolicy: Invalid policy received');
        return false;
      }
      return true;
    },
    fallback: { skipWebGPU: false, reason: null },
    onSuccess: (result) => ({ skipWebGPU: result.skipWebGPU, reason: result.reason })
  });
}

function createLoginItemInvoker({ apiName, methodName, ipcRenderer, channel, validator, fallback }) {
  return createInvokeMethod({
    apiName,
    methodName,
    channel,
    ipcRenderer,
    validateArgs: validator,
    invalidArgMessage: `${apiName}.${methodName}: Invalid parameter - expected boolean`,
    fallback
  });
}

function createShellPreloadAPI({ ipcRenderer, channels, isValidExternalUrl }) {
  return {
    openExternal: createInvokeMethod({
      apiName: 'shellAPI',
      methodName: 'openExternal',
      channel: channels.SHELL.OPEN_EXTERNAL,
      ipcRenderer,
      validateArgs: isValidExternalUrl,
      invalidArgMessage: 'shellAPI.openExternal: Invalid URL provided',
      fallback: { success: false, error: 'Invalid URL' }
    })
  };
}

function createMetricsPreloadAPI({ ipcRenderer, channels }) {
  return {
    getProcessMetrics: createInvokeMethod({
      apiName: 'metricsAPI',
      methodName: 'getProcessMetrics',
      channel: channels.PERFORMANCE.GET_METRICS,
      ipcRenderer
    })
  };
}

function createGpuPreloadAPI({ ipcRenderer, channels, isValidGpuPolicy }) {
  return {
    getPolicy: createGpuPolicyInvoker({
      apiName: 'gpuAPI',
      ipcRenderer,
      channel: channels.GPU.GET_POLICY,
      isValidGpuPolicy
    })
  };
}

function createLoginItemPreloadAPI({ ipcRenderer, channels }) {
  return {
    get: createResponseFallbackInvoker({
      apiName: 'loginItemAPI',
      methodName: 'get',
      channel: channels.LOGIN_ITEM.GET,
      ipcRenderer,
      fallback: false
    }),
    set: createLoginItemInvoker({
      apiName: 'loginItemAPI',
      methodName: 'set',
      ipcRenderer,
      channel: channels.LOGIN_ITEM.SET,
      validator: (enabled) => typeof enabled === 'boolean',
      fallback: { success: false, error: 'Invalid parameter' }
    })
  };
}

export {
  createShellPreloadAPI,
  createMetricsPreloadAPI,
  createGpuPreloadAPI,
  createLoginItemPreloadAPI
};
