import { describe, expect, it } from 'vitest';
import {
  CANVAS_HANDOFF_MESSAGE,
  CONTROL_PORT_MESSAGE,
  WorkerMessageType,
  WorkerResponseType,
  createWorkerMessage,
  createWorkerResponse,
  isCanvasHandoffMessage,
  isControlPortMessage,
  isFrameErrorResponse,
  isFrameMessage,
  isFramePayload,
  isFrameRenderedResponse,
  isStatsResponse
} from '../../../../../src/platform/gpu/worker/protocol';

function bitmap(): ImageBitmap {
  return { close: () => {} } as unknown as ImageBitmap;
}

describe('worker protocol', () => {
  it('creates typed frame-plane messages and responses with timestamps', () => {
    const message = createWorkerMessage(WorkerMessageType.FRAME, { imageBitmap: bitmap() });
    expect(message).toMatchObject({ type: WorkerMessageType.FRAME });
    expect(message.payload).toEqual({ imageBitmap: expect.any(Object) });
    expect(typeof message.timestamp).toBe('number');

    const rendered = createWorkerResponse(WorkerResponseType.FRAME_RENDERED);
    expect(rendered).toMatchObject({ type: WorkerResponseType.FRAME_RENDERED });
    expect(rendered.payload).toBeUndefined();
    expect(typeof rendered.timestamp).toBe('number');

    const stats = createWorkerResponse(WorkerResponseType.STATS, {
      fps: 60,
      frameTime: 16,
      gpuTime: 4,
      uploadTime: 2
    });
    expect(stats).toMatchObject({
      type: WorkerResponseType.STATS,
      payload: { fps: 60, frameTime: 16, gpuTime: 4, uploadTime: 2 }
    });
  });

  it('guards the surviving channel, frame, and response discriminants at the boundary', () => {
    const frameBitmap = bitmap();
    const frameMessage = createWorkerMessage(WorkerMessageType.FRAME, { imageBitmap: frameBitmap });

    expect(isFramePayload({ imageBitmap: frameBitmap })).toBe(true);
    expect(isFramePayload({ imageBitmap: frameBitmap, diagnosticFrameId: 1 })).toBe(false);
    expect(isFramePayload({})).toBe(false);
    expect(isFrameMessage(frameMessage)).toBe(true);
    expect(isFrameMessage({ type: WorkerMessageType.FRAME, payload: {} })).toBe(false);

    const port = {} as unknown as MessagePort;
    expect(isControlPortMessage({ channel: CONTROL_PORT_MESSAGE, port })).toBe(true);
    expect(isControlPortMessage({ channel: CANVAS_HANDOFF_MESSAGE })).toBe(false);

    const canvas = {} as unknown as OffscreenCanvas;
    expect(isCanvasHandoffMessage({ channel: CANVAS_HANDOFF_MESSAGE, canvas })).toBe(true);
    expect(isCanvasHandoffMessage({ channel: CONTROL_PORT_MESSAGE })).toBe(false);

    expect(isFrameRenderedResponse(createWorkerResponse(WorkerResponseType.FRAME_RENDERED))).toBe(true);
    expect(isStatsResponse(createWorkerResponse(WorkerResponseType.STATS, { fps: 1, frameTime: 1 }))).toBe(true);
    expect(isFrameErrorResponse({ type: WorkerResponseType.ERROR, payload: { message: 'boom' } })).toBe(true);
    expect(isFrameErrorResponse({ type: WorkerResponseType.ERROR, payload: {} })).toBe(false);
  });
});
