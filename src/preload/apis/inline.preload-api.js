function createShellPreloadAPI({ ipcRenderer, channels, isValidExternalUrl }) {
  return {
    openExternal: (url) => {
      if (!isValidExternalUrl(url)) {
        console.warn('shellAPI.openExternal: Invalid URL provided');
        return Promise.resolve({ success: false, error: 'Invalid URL' });
      }
      return ipcRenderer.invoke(channels.SHELL.OPEN_EXTERNAL, url);
    }
  };
}

function createMetricsPreloadAPI({ ipcRenderer, channels }) {
  return {
    getProcessMetrics: () => ipcRenderer.invoke(channels.PERFORMANCE.GET_METRICS)
  };
}

function createGpuPreloadAPI({ ipcRenderer, channels, isValidGpuPolicy }) {
  return {
    getPolicy: async () => {
      try {
        const result = await ipcRenderer.invoke(channels.GPU.GET_POLICY);
        if (!result.success) {
          console.warn('gpuAPI.getPolicy: Failed to get policy:', result.error);
          return { skipWebGPU: false, reason: null };
        }
        if (!isValidGpuPolicy(result)) {
          console.warn('gpuAPI.getPolicy: Invalid policy received');
          return { skipWebGPU: false, reason: null };
        }
        return { skipWebGPU: result.skipWebGPU, reason: result.reason };
      } catch (error) {
        console.warn('gpuAPI.getPolicy: IPC error:', error);
        return { skipWebGPU: false, reason: null };
      }
    }
  };
}

function createLoginItemPreloadAPI({ ipcRenderer, channels }) {
  return {
    get: async () => {
      try {
        return await ipcRenderer.invoke(channels.LOGIN_ITEM.GET);
      } catch (error) {
        console.warn('loginItemAPI.get: IPC error:', error);
        return false;
      }
    },
    set: (enabled) => {
      if (typeof enabled !== 'boolean') {
        console.warn('loginItemAPI.set: Invalid parameter - expected boolean');
        return Promise.resolve({ success: false, error: 'Invalid parameter' });
      }
      return ipcRenderer.invoke(channels.LOGIN_ITEM.SET, enabled);
    }
  };
}

export {
  createShellPreloadAPI,
  createMetricsPreloadAPI,
  createGpuPreloadAPI,
  createLoginItemPreloadAPI
};
