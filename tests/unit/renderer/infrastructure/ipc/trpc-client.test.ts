import { describe, it, expect } from 'vitest';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';

/**
 * Exercises the real client module (constructed against the inert `electronTRPC` global installed by
 * tests/setup.js) so its construction is covered. Behavioral assertions live in the consumer tests,
 * which mock this module.
 */
describe('trpcClient', () => {
  it('constructs a typed proxy client exposing the router namespaces', () => {
    expect(typeof trpcClient.device.getStatus.query).toBe('function');
    expect(typeof trpcClient.device.onConnected.subscribe).toBe('function');
    expect(typeof trpcClient.transcode.start.mutate).toBe('function');
    expect(typeof trpcClient.gpu.getPolicy.query).toBe('function');
    expect(typeof trpcClient.loginItem.set.mutate).toBe('function');
    expect(typeof trpcClient.window.onResized.subscribe).toBe('function');
  });
});
