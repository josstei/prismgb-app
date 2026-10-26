import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { CaptureUIBridge } from '@renderer/presentation/bridges/capture-ui.bridge';
import { EventChannels, PlatformEventBus } from '@platform/events';
import { TIMING } from '@platform/config';
import { createLoggerFactory } from '../../../../factories/logger.factory.js';

describe('CaptureUIBridge event behavior', () => {
  let bridge: CaptureUIBridge;
  let bus: PlatformEventBus;
  let publish: MockInstance<PlatformEventBus['publish']>;
  let download: ReturnType<typeof vi.fn<(blob: Blob, filename: string) => Promise<void>>>;
  let loggerFactory: ReturnType<typeof createLoggerFactory>;

  const uiEvents = () => publish.mock.calls.filter(([channel]) => channel.startsWith('ui:'));

  beforeEach(() => {
    bus = new PlatformEventBus();
    publish = vi.spyOn(bus, 'publish');
    download = vi.fn<(blob: Blob, filename: string) => Promise<void>>(async () => {});
    loggerFactory = createLoggerFactory();
    bridge = new CaptureUIBridge({ eventBus: bus, uiController: { triggerDownload: download }, loggerFactory });
  });

  afterEach(async () => {
    await bridge.dispose();
    expect(bus.emitter.eventNames()).toEqual([]);
  });

  it('binds each capture event and detaches them on repeated disposal', async () => {
    bridge.initialize();
    expect(new Set(bus.emitter.eventNames())).toEqual(new Set([
      EventChannels.CAPTURE.SCREENSHOT_TRIGGERED,
      EventChannels.CAPTURE.SCREENSHOT_READY,
      EventChannels.CAPTURE.RECORDING_STARTED,
      EventChannels.CAPTURE.RECORDING_STOPPED,
      EventChannels.CAPTURE.RECORDING_ERROR,
      EventChannels.CAPTURE.RECORDING_DEGRADED
    ]));
    expect(bus.emitter.eventNames().map((event) => bus.emitter.listenerCount(event))).toEqual([1, 1, 1, 1, 1, 1]);
    await bridge.dispose();
    await bridge.dispose();
    bus.publish(EventChannels.CAPTURE.RECORDING_STARTED);
    expect(uiEvents()).toEqual([]);
    expect(bridge.disposables.size).toBe(0);
  });

  it('can dispose before initialization', async () => {
    await expect(bridge.dispose()).resolves.toBeUndefined();
    expect(bridge.disposables.size).toBe(0);
  });

  it('projects screenshot feedback with the configured duration', () => {
    bridge.initialize();
    bus.publish(EventChannels.CAPTURE.SCREENSHOT_TRIGGERED);
    expect(uiEvents()).toEqual([[EventChannels.UI.BUTTON_FEEDBACK, {
      elementKey: 'screenshotBtn', className: 'capturing', duration: TIMING.BUTTON_FEEDBACK_MS
    }]]);
  });

  it('waits for screenshot download before reporting success', async () => {
    bridge.initialize();
    const registered = Promise.withResolvers<void>();
    download.mockReturnValueOnce(registered.promise);
    const blob = new Blob(['screenshot'], { type: 'image/png' });
    const saving = bus.publishAsync(EventChannels.CAPTURE.SCREENSHOT_READY, { blob, filename: 'screenshot.png' });
    expect(download).toHaveBeenCalledWith(blob, 'screenshot.png');
    expect(uiEvents()).toEqual([]);
    registered.resolve();
    await saving;
    expect(uiEvents()).toEqual([[EventChannels.UI.STATUS_MESSAGE, { message: 'Screenshot saved!' }]]);
  });

  it('projects the complete recording start/stop sequence in order', () => {
    bridge.initialize();
    bus.publish(EventChannels.CAPTURE.RECORDING_STARTED);
    bus.publish(EventChannels.CAPTURE.RECORDING_STOPPED);
    expect(uiEvents()).toEqual([
      [EventChannels.UI.RECORD_BUTTON_POP],
      [EventChannels.UI.STATUS_MESSAGE, { message: 'Recording started' }],
      [EventChannels.UI.RECORDING_STATE, { active: true }],
      [EventChannels.UI.RECORD_BUTTON_PRESS],
      [EventChannels.UI.RECORDING_STATE, { active: false }]
    ]);
  });

  it('stops the recording indication and reports string, object, empty and missing errors', () => {
    bridge.initialize();
    for (const error of ['Failed to encode video', new Error('Encoding failed'), '', undefined]) {
      publish.mockClear();
      bus.publish(EventChannels.CAPTURE.RECORDING_ERROR, error === undefined ? {} : { error });
      expect(loggerFactory._getLogger('CaptureUIBridge').error).toHaveBeenCalledWith('Recording error:', error);
      expect(uiEvents()).toEqual([
        [EventChannels.UI.RECORDING_STATE, { active: false }],
        [EventChannels.UI.STATUS_MESSAGE, { message: `Recording failed: ${error}`, type: 'error' }]
      ]);
    }
  });

  it('logs and displays quality degradation with supplied or default frame counts', () => {
    bridge.initialize();
    for (const droppedFrames of [30, undefined]) {
      publish.mockClear();
      const message = `Recording quality degraded: ${droppedFrames ?? 0} frames dropped`;
      bus.publish(EventChannels.CAPTURE.RECORDING_DEGRADED, { droppedFrames });
      expect(loggerFactory._getLogger('CaptureUIBridge').warn).toHaveBeenCalledWith('Recording degraded:', message);
      expect(uiEvents()).toEqual([[EventChannels.UI.STATUS_MESSAGE, { message, type: 'warning' }]]);
    }
  });
});
