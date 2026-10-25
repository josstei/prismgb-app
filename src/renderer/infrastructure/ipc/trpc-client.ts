import { createTRPCProxyClient } from '@trpc/client';
import { ipcTransformer } from '@platform/ipc';
import { ipcLink } from 'electron-trpc/renderer';
import type { AppRouter } from '@main/ipc/router';

/**
 * The renderer-side tRPC client over electron-trpc's `ipcLink`. The link reads the `electronTRPC`
 * bridge the preload exposes on `globalThis`; constructing this module before that bridge exists
 * throws (electron-trpc contract), so unit tests either install a `globalThis.electronTRPC` stub or
 * mock this module. `import type { AppRouter }` is the renderer→main boundary exception (type-only,
 * zero runtime coupling) the layer checker permits for end-to-end tRPC inference.
 */
export const trpcClient = createTRPCProxyClient<AppRouter>({
  transformer: ipcTransformer,
  links: [ipcLink<AppRouter>()]
});

export type RendererTrpcClient = typeof trpcClient;
