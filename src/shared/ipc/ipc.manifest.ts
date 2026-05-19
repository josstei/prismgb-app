import manifest from './ipc.manifest.json';

export type IpcManifest = typeof manifest;
export type IpcNamespaceManifest = IpcManifest['namespaces'][number];

export const IpcContractManifest = manifest;

