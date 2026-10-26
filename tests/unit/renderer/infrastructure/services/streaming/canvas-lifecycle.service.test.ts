import { afterEach, describe, expect, it, vi } from 'vitest';
import { StreamingCanvasLifecycleService } from '@renderer/infrastructure/services/streaming/canvas-lifecycle.service';
import { createEventBus } from '../../../../../factories/event-bus.factory.js';
import { createLoggerFactory } from '../../../../../factories/logger.factory.js';
function fixture() {
  const section = document.createElement('section');
  let canvas = document.createElement('canvas');
  canvas.id = 'stream'; canvas.className = 'video'; canvas.dataset.ref = 'canvas';
  section.append(canvas); document.body.append(section);
  const viewport = { forceResize: vi.fn(), calculateDimensions: vi.fn(() => ({ width: 640, height: 576, scale: 4 })), isInitialized: vi.fn(() => false), initialize: vi.fn(), resetDimensions: vi.fn(), cleanup: vi.fn() };
  const eventBus = createEventBus();
  const service = new StreamingCanvasLifecycleService({ streamViewService: { getCanvas: () => canvas, getCanvasContainer: () => section, getCanvasSection: () => section, setCanvas: (next) => { canvas = next; } }, viewportService: viewport, eventBus, loggerFactory: createLoggerFactory() });
  return { service, viewport, eventBus, canvas: () => canvas };
}
afterEach(() => { document.body.innerHTML = ''; });
describe('canvas lifecycle', () => {
  it('updates CSS and reports dimensions without touching a transferred backing store', () => {
    const { service, canvas } = fixture();
    const resized = vi.fn();
    service.initialize(resized);
    const width = vi.spyOn(canvas(), 'width', 'set');
    service.setupCanvasSize({ width: 160, height: 144 }, true);
    expect(width).not.toHaveBeenCalled();
    expect(resized).toHaveBeenLastCalledWith({ width: 640, height: 576, scale: 4 });
    expect(canvas().style.width).toBe('640px');
    expect(canvas().style.getPropertyValue('--stream-native-aspect-ratio')).toBe('160 / 144');
  });
  it('replaces DOM canvas preserving references, without a render-service dependency', async () => {
    const { service, viewport, canvas } = fixture();
    const original = canvas();
    await service.recreateCanvas();
    expect(canvas()).not.toBe(original);
    expect(canvas().id).toBe('stream');
    expect(canvas().className).toBe('video');
    expect(canvas().dataset.ref).toBe('canvas');
    expect(original.parentElement).toBeNull();
    expect(viewport.resetDimensions).toHaveBeenCalledTimes(1);
  });
});
