import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { StreamingViewService } from '@renderer/infrastructure/services/streaming/streaming-view.service';
import { createLoggerFactory } from '../../../../../factories/logger.factory.js';

describe('StreamingViewService DOM contract', () => {
  let service: StreamingViewService;
  let video: HTMLVideoElement;
  let canvas: HTMLCanvasElement;
  let container: HTMLElement;
  let section: HTMLElement;
  let elements: { streamVideo: HTMLVideoElement | null; streamCanvas: HTMLCanvasElement | null };
  let setStreamCanvas: ReturnType<typeof vi.fn<(canvas: HTMLCanvasElement) => void>>;
  let pause: MockInstance<() => void>;
  let load: MockInstance<() => void>;

  beforeEach(() => {
    video = document.createElement('video');
    // The adapter attaches a stream owned by acquisition; these tests do not
    // create camera tracks or depend on Happy DOM's MediaStream implementation.
    Object.defineProperty(video, 'srcObject', { value: null, writable: true });
    pause = vi.spyOn(video, 'pause');
    load = vi.spyOn(video, 'load');
    canvas = document.createElement('canvas');
    container = document.createElement('div');
    section = document.createElement('section');
    container.append(canvas);
    section.append(container);
    elements = { streamVideo: video, streamCanvas: canvas };
    setStreamCanvas = vi.fn((replacement: HTMLCanvasElement) => { elements.streamCanvas = replacement; });
    service = new StreamingViewService({ uiController: { elements, setStreamCanvas }, loggerFactory: createLoggerFactory() });
  });

  it('attaches/replaces a muted stream, exposes its DOM, and clears playback once', () => {
    expect(service.getVideo()).toBe(video);
    expect(service.getCanvas()).toBe(canvas);
    expect(service.getCanvasContainer()).toBe(container);
    expect(service.getCanvasSection()).toBe(section);
    service.clearStream();
    expect(pause).not.toHaveBeenCalled();

    for (const stream of [{ id: 'first' }, { id: 'replacement' }]) {
      service.attachMutedStream(stream as unknown as MediaStream);
      expect(video.srcObject).toBe(stream);
      expect(video.muted).toBe(true);
    }
    service.setMuted(false);
    expect(video.muted).toBe(false);
    service.clearStream();
    expect(video.srcObject).toBeNull();
    expect(pause).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledOnce();
    service.clearStream();
    expect(pause).toHaveBeenCalledOnce();
  });

  it('normalizes mute values to booleans', () => {
    for (const value of [true, 'yes', 1, {}, false, 0, '', null, undefined]) {
      service.setMuted(value as boolean);
      expect(video.muted).toBe(Boolean(value));
    }
  });

  it.each([null, undefined])('tolerates an unavailable video (%s) across its operations', (missing) => {
    elements.streamVideo = missing as unknown as HTMLVideoElement;
    expect(service.getVideo()).toBeNull();
    expect(() => {
      service.attachMutedStream({} as MediaStream);
      service.setMuted(true);
      service.clearStream();
    }).not.toThrow();
    expect(pause).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it.each([null, undefined])('returns no canvas ancestry when the canvas is unavailable (%s)', (missing) => {
    elements.streamCanvas = missing as unknown as HTMLCanvasElement;
    expect(service.getCanvas()).toBeNull();
    expect(service.getCanvasContainer()).toBeNull();
    expect(service.getCanvasSection()).toBeNull();
  });

  it('handles each missing ancestor without manufacturing a container', () => {
    canvas.remove();
    expect(service.getCanvasContainer()).toBeNull();
    expect(service.getCanvasSection()).toBeNull();
    container.append(canvas);
    container.remove();
    expect(service.getCanvasContainer()).toBe(container);
    expect(service.getCanvasSection()).toBeNull();
  });

  it('replaces only valid canvas elements and reads the replacement hierarchy', () => {
    for (const invalid of [null, undefined, document.createElement('div')]) {
      service.setCanvas(invalid as unknown as HTMLCanvasElement);
      expect(elements.streamCanvas).toBe(canvas);
    }
    expect(setStreamCanvas).not.toHaveBeenCalled();
    const replacement = document.createElement('canvas');
    container.append(replacement);
    service.setCanvas(replacement);
    expect(setStreamCanvas).toHaveBeenCalledOnce();
    expect(service.getCanvas()).toBe(replacement);
    expect(service.getCanvasContainer()).toBe(container);
    expect(service.getCanvasSection()).toBe(section);
  });
});
