/**
 * StreamingCanvasLifecycleService Unit Tests
 * Tests canvas creation and size management for rendering
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StreamingCanvasLifecycleService } from '@renderer/infrastructure/services/streaming/canvas-lifecycle.service.ts';
import { EventChannels } from '@renderer/common/config/event-channels';

describe('StreamingCanvasLifecycleService', () => {
  let service;
  let mockStreamViewService;
  let mockCanvasRenderer;
  let mockViewportService;
  let mockGpuRendererService;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;
  let mockCanvas;
  let mockContainer;
  let mockSection;

  beforeEach(() => {
    // Create mock canvas and container
    mockCanvas = {
      id: 'canvas-id',
      className: 'canvas-class',
      style: {
        width: '',
        height: '',
        position: 'absolute',
        top: '0px',
        left: '0px',
        transform: 'none'
      },
      parentElement: null
    };

    mockContainer = {};
    mockSection = {};

    // Create mock StreamViewService
    mockStreamViewService = {
      getCanvas: vi.fn().mockReturnValue(mockCanvas),
      getCanvasContainer: vi.fn().mockReturnValue(mockContainer),
      getCanvasSection: vi.fn().mockReturnValue(mockSection),
      setCanvas: vi.fn()
    };

    // Create mock CanvasRenderer
    mockCanvasRenderer = {
      resize: vi.fn(),
      resetCanvasState: vi.fn()
    };

    // Create mock ViewportService
    mockViewportService = {
      calculateDimensions: vi.fn().mockReturnValue({ width: 640, height: 576 }),
      initialize: vi.fn(),
      isInitialized: vi.fn().mockReturnValue(false),
      forceResize: vi.fn(),
      resetDimensions: vi.fn(),
      cleanup: vi.fn(),
      _resizeObserver: null
    };

    // Create mock GpuRendererService
    mockGpuRendererService = {
      isCanvasTransferred: vi.fn().mockReturnValue(false),
      resize: vi.fn()
    };

    // Create mock EventBus
    mockEventBus = {
      subscribe: vi.fn(),
      publish: vi.fn()
    };

    // Create mock logger
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockLoggerFactory = {
      create: vi.fn(() => mockLogger)
    };

    // Mock window
    global.window = {
      getComputedStyle: vi.fn().mockReturnValue({
        position: 'absolute',
        top: '0px',
        left: '0px',
        transform: 'none'
      })
    };

    // Mock document
    global.document = {
      createElement: vi.fn().mockImplementation(() => ({
        id: '',
        className: '',
        style: {}
      }))
    };

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete global.window;
    delete global.document;
  });

  describe('Constructor', () => {
    it('should store required dependencies', () => {
      service = new StreamingCanvasLifecycleService({
        streamViewService: mockStreamViewService,
        canvasRenderer: mockCanvasRenderer,
        viewportService: mockViewportService,
        gpuRendererService: mockGpuRendererService,
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });

      expect(service.streamViewService).toBe(mockStreamViewService);
      expect(service.canvasRenderer).toBe(mockCanvasRenderer);
      expect(service.viewportService).toBe(mockViewportService);
      expect(service.gpuRendererService).toBe(mockGpuRendererService);
    });

    it('should initialize state properties', () => {
      service = new StreamingCanvasLifecycleService({
        streamViewService: mockStreamViewService,
        canvasRenderer: mockCanvasRenderer,
        viewportService: mockViewportService,
        gpuRendererService: mockGpuRendererService,
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });

      expect(service._nativeResolution).toBeNull();
      expect(service._useGpuRenderer).toBe(false);
    });
  });

  describe('initialize', () => {
    beforeEach(() => {
      service = new StreamingCanvasLifecycleService({
        streamViewService: mockStreamViewService,
        canvasRenderer: mockCanvasRenderer,
        viewportService: mockViewportService,
        gpuRendererService: mockGpuRendererService,
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });
    });

    it('should call setupCanvasSize with native resolution', () => {
      const setupSpy = vi.spyOn(service, 'setupCanvasSize');
      const resolution = { width: 160, height: 144 };

      service.initialize(resolution);

      expect(setupSpy).toHaveBeenCalledWith(resolution);
    });
  });

  describe('handleCanvasExpired', () => {
    beforeEach(() => {
      service = new StreamingCanvasLifecycleService({
        streamViewService: mockStreamViewService,
        canvasRenderer: mockCanvasRenderer,
        viewportService: mockViewportService,
        gpuRendererService: mockGpuRendererService,
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });
    });

    it('should recreate canvas and setup size', () => {
      const recreateSpy = vi.spyOn(service, 'recreateCanvas');
      const setupSpy = vi.spyOn(service, 'setupCanvasSize');

      service._nativeResolution = { width: 160, height: 144 };
      service._useGpuRenderer = true;

      // Mock parent element for recreateCanvas
      mockCanvas.parentElement = {
        replaceChild: vi.fn()
      };

      service.handleCanvasExpired();

      expect(recreateSpy).toHaveBeenCalled();
      expect(setupSpy).toHaveBeenCalledWith({ width: 160, height: 144 }, true);
    });
  });

  describe('handleFullscreenChange', () => {
    beforeEach(() => {
      service = new StreamingCanvasLifecycleService({
        streamViewService: mockStreamViewService,
        canvasRenderer: mockCanvasRenderer,
        viewportService: mockViewportService,
        gpuRendererService: mockGpuRendererService,
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });
    });

    it('should call viewportService.forceResize', () => {
      service.handleFullscreenChange();

      expect(mockViewportService.forceResize).toHaveBeenCalled();
    });
  });

  describe('setupCanvasSize', () => {
    beforeEach(() => {
      service = new StreamingCanvasLifecycleService({
        streamViewService: mockStreamViewService,
        canvasRenderer: mockCanvasRenderer,
        viewportService: mockViewportService,
        gpuRendererService: mockGpuRendererService,
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });
    });

    it('should return early if canvas is missing', () => {
      mockStreamViewService.getCanvas.mockReturnValue(null);

      service.setupCanvasSize({ width: 160, height: 144 });

      expect(mockViewportService.calculateDimensions).not.toHaveBeenCalled();
    });

    it('should return early if container is missing', () => {
      mockStreamViewService.getCanvasContainer.mockReturnValue(null);

      service.setupCanvasSize({ width: 160, height: 144 });

      expect(mockViewportService.calculateDimensions).not.toHaveBeenCalled();
    });

    it('should return early if section is missing', () => {
      mockStreamViewService.getCanvasSection.mockReturnValue(null);

      service.setupCanvasSize({ width: 160, height: 144 });

      expect(mockViewportService.calculateDimensions).not.toHaveBeenCalled();
    });

    it('should use default resolution if not provided', () => {
      service.setupCanvasSize();

      expect(service._nativeResolution).toEqual({ width: 160, height: 144 });
    });

    it('should store native resolution and gpu flag', () => {
      service.setupCanvasSize({ width: 320, height: 288 }, true);

      expect(service._nativeResolution).toEqual({ width: 320, height: 288 });
      expect(service._useGpuRenderer).toBe(true);
    });

    it('should return early if dimensions calculation fails', () => {
      mockViewportService.calculateDimensions.mockReturnValue(null);

      service.setupCanvasSize({ width: 160, height: 144 });

      expect(mockCanvasRenderer.resize).not.toHaveBeenCalled();
    });

    it('should resize via GPU when canvas is transferred', () => {
      mockGpuRendererService.isCanvasTransferred.mockReturnValue(true);

      service.setupCanvasSize({ width: 160, height: 144 });

      expect(mockGpuRendererService.resize).toHaveBeenCalledWith(640, 576);
      expect(mockCanvas.style.width).toBe('640px');
      expect(mockCanvas.style.height).toBe('576px');
    });

    it('should resize via canvasRenderer when canvas is not transferred', () => {
      mockGpuRendererService.isCanvasTransferred.mockReturnValue(false);

      service.setupCanvasSize({ width: 160, height: 144 });

      expect(mockCanvasRenderer.resize).toHaveBeenCalledWith(mockCanvas, 640, 576);
    });

    it('should initialize viewportService resize observer if not present', () => {
      mockViewportService.isInitialized.mockReturnValue(false);

      service.setupCanvasSize({ width: 160, height: 144 });

      expect(mockViewportService.initialize).toHaveBeenCalledWith(
        mockSection,
        expect.any(Function)
      );
    });

    it('should not reinitialize resize observer if already present', () => {
      mockViewportService.isInitialized.mockReturnValue(true);

      service.setupCanvasSize({ width: 160, height: 144 });

      expect(mockViewportService.initialize).not.toHaveBeenCalled();
    });
  });

  describe('recreateCanvas', () => {
    beforeEach(() => {
      service = new StreamingCanvasLifecycleService({
        streamViewService: mockStreamViewService,
        canvasRenderer: mockCanvasRenderer,
        viewportService: mockViewportService,
        gpuRendererService: mockGpuRendererService,
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });
    });

    it('should return early if old canvas is missing', () => {
      mockStreamViewService.getCanvas.mockReturnValue(null);

      service.recreateCanvas();

      expect(global.document.createElement).not.toHaveBeenCalled();
    });

    it('should return early if parent element is missing', () => {
      mockCanvas.parentElement = null;

      service.recreateCanvas();

      expect(global.document.createElement).not.toHaveBeenCalled();
    });

    it('should create new canvas with same id and class', () => {
      const mockParent = {
        replaceChild: vi.fn()
      };
      mockCanvas.parentElement = mockParent;

      const newCanvas = {
        id: '',
        className: '',
        style: {}
      };
      global.document.createElement.mockReturnValue(newCanvas);

      service.recreateCanvas();

      expect(global.document.createElement).toHaveBeenCalledWith('canvas');
      expect(newCanvas.id).toBe('canvas-id');
      expect(newCanvas.className).toBe('canvas-class');
    });

    it('should copy computed styles to new canvas', () => {
      const mockParent = {
        replaceChild: vi.fn()
      };
      mockCanvas.parentElement = mockParent;

      const newCanvas = {
        id: '',
        className: '',
        style: {}
      };
      global.document.createElement.mockReturnValue(newCanvas);

      service.recreateCanvas();

      expect(global.window.getComputedStyle).toHaveBeenCalledWith(mockCanvas);
      expect(newCanvas.style.position).toBe('absolute');
      expect(newCanvas.style.top).toBe('0px');
      expect(newCanvas.style.left).toBe('0px');
      expect(newCanvas.style.transform).toBe('none');
    });

    it('should replace old canvas with new one', () => {
      const mockParent = {
        replaceChild: vi.fn()
      };
      mockCanvas.parentElement = mockParent;

      const newCanvas = {
        id: '',
        className: '',
        style: {}
      };
      global.document.createElement.mockReturnValue(newCanvas);

      service.recreateCanvas();

      expect(mockParent.replaceChild).toHaveBeenCalledWith(newCanvas, mockCanvas);
    });

    it('should update streamViewService with new canvas', () => {
      const mockParent = {
        replaceChild: vi.fn()
      };
      mockCanvas.parentElement = mockParent;

      const newCanvas = {
        id: '',
        className: '',
        style: {}
      };
      global.document.createElement.mockReturnValue(newCanvas);

      service.recreateCanvas();

      expect(mockStreamViewService.setCanvas).toHaveBeenCalledWith(newCanvas);
    });

    it('should reset canvas state and dimensions', () => {
      const mockParent = {
        replaceChild: vi.fn()
      };
      mockCanvas.parentElement = mockParent;

      service.recreateCanvas();

      expect(mockCanvasRenderer.resetCanvasState).toHaveBeenCalled();
      expect(mockViewportService.resetDimensions).toHaveBeenCalled();
    });

    it('should publish CANVAS_RECREATED event', () => {
      const mockParent = {
        replaceChild: vi.fn()
      };
      mockCanvas.parentElement = mockParent;

      const newCanvas = {
        id: '',
        className: '',
        style: {}
      };
      global.document.createElement.mockReturnValue(newCanvas);

      service.recreateCanvas();

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.RENDER.CANVAS_RECREATED,
        { oldCanvas: mockCanvas, newCanvas }
      );
    });

    it('should log recreation', () => {
      const mockParent = {
        replaceChild: vi.fn()
      };
      mockCanvas.parentElement = mockParent;

      service.recreateCanvas();

      expect(mockLogger.info).toHaveBeenCalledWith('Canvas element recreated for next GPU session');
    });
  });

  describe('cleanup', () => {
    beforeEach(() => {
      service = new StreamingCanvasLifecycleService({
        streamViewService: mockStreamViewService,
        canvasRenderer: mockCanvasRenderer,
        viewportService: mockViewportService,
        gpuRendererService: mockGpuRendererService,
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });
    });

    it('should call viewportService cleanup', () => {
      service.cleanup();

      expect(mockViewportService.cleanup).toHaveBeenCalled();
    });
  });
});
