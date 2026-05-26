import manifest from './ipc.manifest.json';

export type IpcManifest = typeof manifest;
export type IpcNamespaceManifest = IpcManifest['namespaces'][number];

// CODEBASE_IPC_CHANNEL_MAP:START
export const IPC_CHANNELS = {
  DEVICE: { GET_STATUS: 'device:get-status', CONNECTED: 'device:connected', DISCONNECTED: 'device:disconnected' },
  SHELL: { OPEN_EXTERNAL: 'shell:open-external' },
  WINDOW: { SET_FULLSCREEN: 'window:set-fullscreen', IS_FULLSCREEN: 'window:is-fullscreen', ENTER_FULLSCREEN: 'window:enter-fullscreen', LEAVE_FULLSCREEN: 'window:leave-fullscreen', RESIZED: 'window:resized' },
  UPDATE: { GET_STATUS: 'update:get-status', CHECK: 'update:check', DOWNLOAD: 'update:download', INSTALL: 'update:install', AVAILABLE: 'update:available', NOT_AVAILABLE: 'update:not-available', PROGRESS: 'update:progress', DOWNLOADED: 'update:downloaded', ERROR: 'update:error' },
  PERFORMANCE: { GET_METRICS: 'performance:get-metrics' },
  GPU: { GET_POLICY: 'gpu:get-policy' },
  LOGIN_ITEM: { GET: 'login-item:get', SET: 'login-item:set' },
  TRANSCODE: { START: 'transcode:start', CANCEL: 'transcode:cancel', GET_STATUS: 'transcode:get-status', PROGRESS: 'transcode:progress', COMPLETED: 'transcode:completed', ERROR: 'transcode:error', CANCELLED: 'transcode:cancelled' }
} as const;

export type IpcChannels = typeof IPC_CHANNELS;
// CODEBASE_IPC_CHANNEL_MAP:END

export const IpcContractManifest = manifest;
type IpcChannelNamespaceMap = Readonly<Record<string, Readonly<Record<string, string>>>>;

function assertUniqueManifestValue(value: string, seen: Set<string>, label: string): void {
  if (seen.has(value)) throw new Error(`Duplicate IPC manifest ${label} "${value}"`);
  seen.add(value);
}

export function createIpcChannels(ipcManifest: IpcManifest = IpcContractManifest): IpcChannelNamespaceMap {
  const namespaceKeys = new Set<string>(), apiNames = new Set<string>(), channels = new Set<string>();
  return Object.fromEntries(ipcManifest.namespaces.map((namespace) => {
    const channelKeys = new Set<string>();
    assertUniqueManifestValue(namespace.namespace, namespaceKeys, 'namespace');
    assertUniqueManifestValue(namespace.apiName, apiNames, 'apiName');
    return [namespace.namespace, Object.fromEntries(
      [...(namespace.invoke || []), ...(namespace.subscriptions || [])].map((entry) => {
        if (!entry.channelKey || !entry.channel) throw new Error(`IPC manifest channel metadata missing for ${namespace.apiName}.${entry.method}`);
        assertUniqueManifestValue(entry.channelKey, channelKeys, `${namespace.apiName} channelKey`);
        assertUniqueManifestValue(entry.channel, channels, 'channel');
        return [entry.channelKey, entry.channel];
      })
    )];
  }));
}

function assertIpcChannelsMatchManifest(
  ipcManifest: IpcManifest = IpcContractManifest,
  ipcChannels: IpcChannelNamespaceMap = IPC_CHANNELS
): void {
  const expectedChannels = createIpcChannels(ipcManifest);
  const expectedNamespaces = Object.keys(expectedChannels), actualNamespaces = Object.keys(ipcChannels);
  const missingNamespaces = expectedNamespaces.filter((namespace) => !actualNamespaces.includes(namespace)), extraNamespaces = actualNamespaces.filter((namespace) => !expectedNamespaces.includes(namespace));
  if (missingNamespaces.length || extraNamespaces.length) throw new Error(`IPC channel namespace drift: ${[missingNamespaces.length ? `missing ${missingNamespaces.join(', ')}` : '', extraNamespaces.length ? `extra ${extraNamespaces.join(', ')}` : ''].filter(Boolean).join('; ')}`);
  for (const namespace of expectedNamespaces) {
    const expectedNamespaceChannels = expectedChannels[namespace], actualNamespaceChannels = ipcChannels[namespace] || {};
    const expectedKeys = Object.keys(expectedNamespaceChannels), actualKeys = Object.keys(actualNamespaceChannels);
    const missingKeys = expectedKeys.filter((key) => !actualKeys.includes(key)), extraKeys = actualKeys.filter((key) => !expectedKeys.includes(key));
    if (missingKeys.length || extraKeys.length) throw new Error(`IPC channel key drift for ${namespace}: ${[missingKeys.length ? `missing ${missingKeys.join(', ')}` : '', extraKeys.length ? `extra ${extraKeys.join(', ')}` : ''].filter(Boolean).join('; ')}`);
    for (const key of expectedKeys) {
      if (actualNamespaceChannels[key] !== expectedNamespaceChannels[key]) throw new Error(`IPC channel value drift for ${namespace}.${key}: expected ${expectedNamespaceChannels[key]}, got ${actualNamespaceChannels[key]}`);
    }
  }
}

assertIpcChannelsMatchManifest();
