import { describe, it, expect } from 'vitest';
import { IPC_CHANNELS } from '@platform/ipc';
import { EventChannels } from '@platform/events';

/**
 * Phase 3 removed the IPC manifest and its `assertIpcChannelsMatchManifest` cross-validation, so the
 * push channel ↔ EventBus channel mapping is now hand-maintained (load-bearing trade (a)). This test
 * is the remaining guard: for every main→renderer push channel, the relocated `IPC_CHANNELS` string
 * (which the router subscription listens on and the package emitters send through `WindowService.send`)
 * must equal the `@platform/events` `EventChannels` string the renderer republishes onto — except the
 * window channels, whose IPC and UI-event names intentionally differ.
 */
describe('IPC push channel ↔ EventBus channel parity (trade a)', () => {
  it('keeps device push channels in sync', () => {
    expect(IPC_CHANNELS.DEVICE.CONNECTED).toBe(EventChannels.DEVICE.CONNECTED);
    expect(IPC_CHANNELS.DEVICE.DISCONNECTED).toBe(EventChannels.DEVICE.DISCONNECTED);
  });

  it('keeps update push channels in sync', () => {
    expect(IPC_CHANNELS.UPDATE.AVAILABLE).toBe(EventChannels.UPDATE.AVAILABLE);
    expect(IPC_CHANNELS.UPDATE.NOT_AVAILABLE).toBe(EventChannels.UPDATE.NOT_AVAILABLE);
    expect(IPC_CHANNELS.UPDATE.PROGRESS).toBe(EventChannels.UPDATE.PROGRESS);
    expect(IPC_CHANNELS.UPDATE.DOWNLOADED).toBe(EventChannels.UPDATE.DOWNLOADED);
    expect(IPC_CHANNELS.UPDATE.ERROR).toBe(EventChannels.UPDATE.ERROR);
  });

  it('keeps transcode push channels in sync', () => {
    expect(IPC_CHANNELS.TRANSCODE.PROGRESS).toBe(EventChannels.TRANSCODE.PROGRESS);
    expect(IPC_CHANNELS.TRANSCODE.COMPLETED).toBe(EventChannels.TRANSCODE.COMPLETED);
    expect(IPC_CHANNELS.TRANSCODE.ERROR).toBe(EventChannels.TRANSCODE.ERROR);
    expect(IPC_CHANNELS.TRANSCODE.CANCELLED).toBe(EventChannels.TRANSCODE.CANCELLED);
  });

  it('documents the intentional window IPC ↔ UI-event namespace difference', () => {
    expect(IPC_CHANNELS.WINDOW.RESIZED).toBe('window:resized');
    expect(EventChannels.UI.WINDOW_RESIZED).toBe('ui:window-resized');
    expect(IPC_CHANNELS.WINDOW.RESIZED).not.toBe(EventChannels.UI.WINDOW_RESIZED);
  });
});
