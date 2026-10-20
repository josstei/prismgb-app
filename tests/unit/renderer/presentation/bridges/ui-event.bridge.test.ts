import { describe, it, expect, beforeEach } from 'vitest';
import { UiEventBridge } from '@renderer/presentation/bridges/ui-event.bridge';
import { EventChannels } from '@renderer/lib/events/event-channels';
import { createInjectableHarness } from '../../../../support/di/injectable.harness';

const callOrder = (...mocks) => mocks.map((mock) => mock.mock.invocationCallOrder[0]);

describe('UiEventBridge', () => {
  let bridge;
  let eventBus;
  let components;
  let autoHide;
  let feedback;
  let logger;
  let dom;

  beforeEach(() => {
    dom = {
      streaming: {
        streamToolbar: document.createElement('div'),
        fullscreenBtn: document.createElement('button'),
        fullscreenControls: document.createElement('div')
      }
    };
    const h = createInjectableHarness(UiEventBridge, { overrides: { domBindings: dom } });
    bridge = h.subject;
    logger = h.logger;
    ({ eventBus, uiComponentHost: components, autoHideEffect: autoHide, feedbackEffect: feedback } = h.deps);
    bridge.initialize();
  });

  it('subscribes to the capture, transcode and presentation-mode channels on initialize', () => {
    const channels = eventBus.subscribe.mock.calls.map(([channel]) => channel);

    expect(channels.sort()).toEqual([
      EventChannels.CAPTURE.RECORDING_ERROR,
      EventChannels.CAPTURE.RECORDING_STARTED,
      EventChannels.CAPTURE.RECORDING_STOPPED,
      EventChannels.CAPTURE.SCREENSHOT_TRIGGERED,
      EventChannels.TRANSCODE.CANCELLED,
      EventChannels.TRANSCODE.COMPLETED,
      EventChannels.TRANSCODE.ERROR,
      EventChannels.TRANSCODE.STARTED,
      EventChannels.UI.FULLSCREEN_STATE,
      EventChannels.UI.STREAMING_MODE
    ].sort());
    expect(logger.info).toHaveBeenCalledWith('UiEventBridge initialized');
  });

  it('flashes the shutter before the screenshot button feedback', () => {
    eventBus.publish(EventChannels.CAPTURE.SCREENSHOT_TRIGGERED);

    const [flash, button] = callOrder(feedback.shutterFlash, feedback.screenshotFeedback);
    expect(flash).toBeLessThan(button);
  });

  it('pops the record button, then marks it recording when recording starts', () => {
    eventBus.publish(EventChannels.CAPTURE.RECORDING_STARTED);

    expect(feedback.setRecording).toHaveBeenCalledWith(true);
    const [pop, recording] = callOrder(feedback.recordButtonPop, feedback.setRecording);
    expect(pop).toBeLessThan(recording);
  });

  it('presses the record button, then clears recording when recording stops', () => {
    eventBus.publish(EventChannels.CAPTURE.RECORDING_STOPPED);

    expect(feedback.setRecording).toHaveBeenCalledWith(false);
    const [press, recording] = callOrder(feedback.recordButtonPress, feedback.setRecording);
    expect(press).toBeLessThan(recording);
  });

  it('clears recording without button feedback on a recording error', () => {
    eventBus.publish(EventChannels.CAPTURE.RECORDING_ERROR, { error: 'boom' });

    expect(feedback.setRecording).toHaveBeenCalledWith(false);
    expect(feedback.recordButtonPress).not.toHaveBeenCalled();
  });

  it('disables the record button while transcoding', () => {
    eventBus.publish(EventChannels.TRANSCODE.STARTED, { jobId: 'job-1', format: 'mp4' });

    expect(feedback.setRecordButtonDisabled).toHaveBeenCalledWith(true);
  });

  it.each([
    [EventChannels.TRANSCODE.COMPLETED, { jobId: 'job-1', outputPath: '/tmp/out.mp4' }],
    [EventChannels.TRANSCODE.ERROR, { jobId: 'job-1', error: 'failed' }],
    [EventChannels.TRANSCODE.CANCELLED, { jobId: 'job-1' }]
  ])('re-enables the record button on %s', (channel, payload) => {
    eventBus.publish(channel, payload);

    expect(feedback.setRecordButtonDisabled).toHaveBeenCalledWith(false);
  });

  it('enters streaming mode on the controls, then enables toolbar and cursor auto-hide', () => {
    const streamingControls = components.get('streamingControlsComponent');

    eventBus.publish(EventChannels.UI.STREAMING_MODE, { enabled: true });

    expect(streamingControls.setStreamingMode).toHaveBeenCalledWith(true);
    expect(autoHide.enableToolbar).toHaveBeenCalledWith(dom.streaming.streamToolbar);
    const order = callOrder(streamingControls.setStreamingMode, autoHide.enableToolbar, autoHide.enableCursor);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(autoHide.disableCursor).not.toHaveBeenCalled();
    expect(components.get('shaderSelectorComponent').hide).not.toHaveBeenCalled();
  });

  it('leaves streaming mode, then disables cursor and toolbar auto-hide and hides the shader selector', () => {
    const streamingControls = components.get('streamingControlsComponent');
    const shaderSelector = components.get('shaderSelectorComponent');

    eventBus.publish(EventChannels.UI.STREAMING_MODE, { enabled: false });

    expect(streamingControls.setStreamingMode).toHaveBeenCalledWith(false);
    const order = callOrder(
      streamingControls.setStreamingMode,
      autoHide.disableCursor,
      autoHide.disableToolbar,
      shaderSelector.hide
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(autoHide.enableCursor).not.toHaveBeenCalled();
  });

  it('retitles the fullscreen button and enables controls auto-hide in fullscreen', () => {
    eventBus.publish(EventChannels.UI.FULLSCREEN_STATE, { active: true });

    expect(dom.streaming.fullscreenBtn.title).toBe('Exit Fullscreen');
    expect(autoHide.enableControls).toHaveBeenCalledWith(dom.streaming.fullscreenControls);
    expect(autoHide.disableControls).not.toHaveBeenCalled();
  });

  it('restores the fullscreen button title and disables controls auto-hide when leaving fullscreen', () => {
    eventBus.publish(EventChannels.UI.FULLSCREEN_STATE, { active: false });

    expect(dom.streaming.fullscreenBtn.title).toBe('Fullscreen');
    expect(autoHide.disableControls).toHaveBeenCalled();
    expect(autoHide.enableControls).not.toHaveBeenCalled();
  });

  it('still toggles controls auto-hide without a fullscreen button', () => {
    dom.streaming.fullscreenBtn = null;

    eventBus.publish(EventChannels.UI.FULLSCREEN_STATE, { active: true });

    expect(autoHide.enableControls).toHaveBeenCalledWith(dom.streaming.fullscreenControls);
  });

  it('unsubscribes every handler on dispose', async () => {
    const unsubscribes = eventBus.subscribe.mock.results.map((result) => result.value);

    await bridge.dispose();
    eventBus.publish(EventChannels.CAPTURE.SCREENSHOT_TRIGGERED);

    unsubscribes.forEach((unsubscribe) => expect(unsubscribe).toHaveBeenCalled());
    expect(feedback.shutterFlash).not.toHaveBeenCalled();
  });
});
