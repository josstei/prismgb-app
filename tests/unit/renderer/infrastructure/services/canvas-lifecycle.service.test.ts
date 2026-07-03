import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StreamingCanvasLifecycleService } from '@renderer/infrastructure/services/streaming/canvas-lifecycle.service';
import { EventChannels } from '@platform/events';
import {
  createMockCanvas,
  createMockElement,
  createStreamingViewServiceMock,
  createViewportServiceMock,
  createEventBus,
  createLoggerFactory,
} from '../../../../factories/index.js';
import {
  installGetComputedStyleMock,
  installDocumentCreateElementMock
} from '../../../../support/mocks/browser-api.installers.js';

describe('StreamingCanvasLifecycleService', () => {
  let service: StreamingCanvasLifecycleService;
  let mockStreamViewService: any;
  let mockViewportService: any;
  let mockStreamingRenderService: any;
  let mockEventBus: any;
  let mockLogger: any;
  let mockLoggerFactory: any;
  let mockCanvas: any;
  let mockContainer: any;
  let mockSection: any;
  let createElementMock: any;
  let getComputedStyleMock: any;

  beforeEach(() => {
    mockCanvas = createMockCanvas();
    mockCanvas.id = 'canvas-id';
    mockCanvas.className = 'canvas-class';
    mockCanvas.style = {
      width: '',
      height: '',
      position: 'absolute',
      top: '0px',
      left: '0px',
      transform: 'none'
    } as any;
    mockCanvas.parentElement = null;

    mockContainer = createMockElement('div');
    mockSection = createMockElement('div');

    mockStreamViewService = createStreamingViewServiceMock({
      getCanvas: vi.fn(() => mockCanvas),
      getCanvasContainer: vi.fn(() => mockContainer),
      getCanvasSection: vi.fn(() => mockSection),
      setCanvas: vi.fn()
    });

    mockViewportService = createViewportServiceMock({
      calculateDimensions: vi.fn().mockReturnValue({ width: 640, height: 576 }),
      isInitialized: vi.fn().mockReturnValue(false),
      forceResize: vi.fn(),
      resetDimensions: vi.fn(),
      cleanup: vi.fn()
    });

    mockStreamingRenderService = {
      isCanvasTransferred: vi.fn().mockReturnValue(false),
      resize: vi.fn(),
      resetCanvasState: vi.fn().mockResolvedValue(undefined)
    };

    mockEventBus = createEventBus();
    mockLoggerFactory = createLoggerFactory();
    mockLogger = mockLoggerFactory._getLogger('StreamingCanvasLifecycleService');

    getComputedStyleMock = installGetComputedStyleMock(() => ({
      position: 'absolute',
      top: '0px',
      left: '0px',
      transform: 'none'
    }));
    createElementMock = installDocumentCreateElementMock();

  });

  afterEach(() => {
    createElementMock.cleanup();
    getComputedStyleMock.cleanup();
  });

  describe('Constructor', () => {
    it('should store required dependencies', () => {
      service = new StreamingCanvasLifecycleService({
        streamViewService: mockStreamViewService,
        viewportService: mockViewportService,
        streamingRenderService: mockStreamingRenderService,
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });

      expect((service as any).streamViewService).toBe(mockStreamViewService);
      expect((service as any).viewportService).toBe(mockViewportService);
      expect((service as any).streamingRenderService).toBe(mockStreamingRenderService);
    });

    it('should initialize state properties', () => {
      service = new StreamingCanvasLifecycleService({
        streamViewService: mockStreamViewService,
        viewportService: mockViewportService,
        streamingRenderService: mockStreamingRenderService,
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });

      expect((service as any)._nativeResolution).toBeNull();
      expect((service as any)._useGpuRenderer).toBe(false);
    });
  });

  describe('initialize', () => {
    beforeEach(() => {
      service = new StreamingCanvasLifecycleService({
        streamViewService: mockStreamViewService,
        viewportService: mockViewportService,
        streamingRenderService: mockStreamingRenderService,
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });
    });

    it('should setup canvas size', () => {
      vi.spyOn(service, 'setupCanvasSize');
      service.initialize();
      expect(service.setupCanvasSize).toHaveBeenCalled();
    });
  });

  describe('setupCanvasSize', () => {
    beforeEach(() => {
      service = new StreamingCanvasLifecycleService({
        streamViewService: mockStreamViewService,
        viewportService: mockViewportService,
        streamingRenderService: mockStreamingRenderService,
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });
    });

    it('should resize via GPU when canvas is transferred', () => {
      mockStreamingRenderService.isCanvasTransferred.mockReturnValue(true);

      service.setupCanvasSize({ width: 160, height: 144 });

      expect(mockStreamingRenderService.resize).toHaveBeenCalledWith(640, 576);
      expect(mockCanvas.style.width).toBe('640px');
      expect(mockCanvas.style.height).toBe('576px');
    });

    it('should resize directly when canvas is not transferred', () => {
      mockStreamingRenderService.isCanvasTransferred.mockReturnValue(false);

      service.setupCanvasSize({ width: 160, height: 144 });

      expect(mockCanvas.style.width).toBe('640px');
      expect(mockStreamingRenderService.resize).toHaveBeenCalledWith(640, 576);
    });
  });

  describe('recreateCanvas', () => {
    beforeEach(() => {
      service = new StreamingCanvasLifecycleService({
        streamViewService: mockStreamViewService,
        viewportService: mockViewportService,
        streamingRenderService: mockStreamingRenderService,
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });
    });

    it('should recreate canvas and reset state', async () => {
      const mockParent = createMockElement('div');
      mockCanvas.parentElement = mockParent;

      const newCanvas = createMockElement('canvas');
      newCanvas.id = '';
      newCanvas.className = '';
      newCanvas.style = {};
      createElementMock.createElement.mockReturnValue(newCanvas);

      await service.recreateCanvas();

      expect(mockStreamingRenderService.resetCanvasState).toHaveBeenCalled();
      expect(mockViewportService.resetDimensions).toHaveBeenCalled();
    });
  });
});
