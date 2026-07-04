/**
 * Shared Vitest setup entrypoint.
 *
 * Browser API mocks are provided by project-specific setup modules under tests/support/mocks.
 * This also installs an inert `electronTRPC` bridge on globalThis so importing the renderer tRPC
 * client (electron-trpc's `ipcLink` reads this global at construction) does not throw in tests that
 * exercise it transitively. Tests asserting IPC behavior mock `@renderer/infrastructure/ipc/
 * trpc-client` directly.
 */

if (!globalThis.electronTRPC) {
  globalThis.electronTRPC = {
    sendMessage: () => {},
    onMessage: () => {}
  };
}

export {};
