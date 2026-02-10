import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BasePipeline } from '../../../src/infrastructure/base-pipeline';
import type { IPipelineOptions, PipelineState, IPipelineError, IAdapterInfo, RenderAPI } from '../../../src/domain/pipeline';
import type { FrameSource } from '../../../src/domain/frame';
import type { PipelineUniforms } from '../../../src/domain/shaders';

class TestPipeline extends BasePipeline {
  readonly api: RenderAPI = 'canvas2d';

  initializeCalled = false;
  renderFrameCalled = false;
  resizeCalled = false;
  suspendCalled = false;
  resumeCalled = false;
  disposeCalled = false;

  shouldThrowOnInit = false;
  shouldThrowOnResume = false;
  shouldThrowOnRender = false;

  getAdapterInfo(): IAdapterInfo | null {
    return {
      vendor: 'Test',
      architecture: 'Test',
      device: 'Test',
      description: 'Test Device',
      api: 'canvas2d'
    };
  }

  protected async onInitialize(options: IPipelineOptions): Promise<void> {
    this.initializeCalled = true;
    if (this.shouldThrowOnInit) {
      throw new Error('Init failed');
    }
  }

  protected onRenderFrame(source: FrameSource, uniforms: PipelineUniforms): void {
    this.renderFrameCalled = true;
    if (this.shouldThrowOnRender) {
      throw new Error('Render failed');
    }
  }

  protected onResize(width: number, height: number): void {
    this.resizeCalled = true;
  }

  protected onSuspend(): void {
    this.suspendCalled = true;
  }

  protected async onResume(): Promise<void> {
    this.resumeCalled = true;
    if (this.shouldThrowOnResume) {
      throw new Error('Resume failed');
    }
  }

  protected onDispose(): void {
    this.disposeCalled = true;
  }
}

describe('BasePipeline', () => {
  let pipeline: TestPipeline;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    pipeline = new TestPipeline();
    canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
  });

  describe('State Machine', () => {
    it('should start in uninitialized state', () => {
      expect(pipeline.state).toBe('uninitialized');
    });

    it('should transition to ready after successful initialization', async () => {
      const onStateChange = vi.fn();

      await pipeline.initialize({
        canvas,
        config: {
          nativeWidth: 160,
          nativeHeight: 144,
          targetWidth: 640,
          targetHeight: 480
        },
        callbacks: { onStateChange }
      });

      expect(pipeline.state).toBe('ready');
      expect(onStateChange).toHaveBeenCalledWith('ready');
    });

    it('should transition to suspended from ready', async () => {
      await pipeline.initialize({
        canvas,
        config: {
          nativeWidth: 160,
          nativeHeight: 144,
          targetWidth: 640,
          targetHeight: 480
        }
      });

      pipeline.suspend();
      expect(pipeline.state).toBe('suspended');
      expect(pipeline.suspendCalled).toBe(true);
    });

    it('should transition back to ready from suspended', async () => {
      await pipeline.initialize({
        canvas,
        config: {
          nativeWidth: 160,
          nativeHeight: 144,
          targetWidth: 640,
          targetHeight: 480
        }
      });

      pipeline.suspend();
      await pipeline.resume();

      expect(pipeline.state).toBe('ready');
      expect(pipeline.resumeCalled).toBe(true);
    });

    it('should transition to disposed', async () => {
      await pipeline.initialize({
        canvas,
        config: {
          nativeWidth: 160,
          nativeHeight: 144,
          targetWidth: 640,
          targetHeight: 480
        }
      });

      pipeline.dispose();
      expect(pipeline.state).toBe('disposed');
      expect(pipeline.disposeCalled).toBe(true);
    });

    it('should transition to error on unrecoverable error', async () => {
      pipeline.shouldThrowOnInit = true;

      try {
        await pipeline.initialize({
          canvas,
          config: {
            nativeWidth: 160,
            nativeHeight: 144,
            targetWidth: 640,
            targetHeight: 480
          }
        });
      } catch {
      }

      expect(pipeline.state).toBe('error');
    });

    it('should stay in ready on recoverable error', async () => {
      await pipeline.initialize({
        canvas,
        config: {
          nativeWidth: 160,
          nativeHeight: 144,
          targetWidth: 640,
          targetHeight: 480
        }
      });

      pipeline.shouldThrowOnRender = true;

      const mockSource = canvas;
      const mockUniforms = {
        upscale: {
          inputSize: [160, 144],
          outputSize: [640, 480],
          scaleFactor: 4
        },
        unsharp: {
          texelSize: [1 / 640, 1 / 480],
          strength: 0,
          scaleFactor: 4
        },
        color: {
          gamma: 1.0,
          saturation: 1.0,
          greenBias: 0.0,
          brightness: 1.0,
          contrast: 1.0
        },
        crt: {
          resolution: [640, 480],
          scaleFactor: 4,
          scanlineStrength: 0,
          pixelMaskStrength: 0,
          bloomStrength: 0,
          curvature: 0,
          vignetteStrength: 0
        }
      };

      pipeline.renderFrame(mockSource, mockUniforms);
      expect(pipeline.state).toBe('ready');
    });
  });

  describe('State Assertions', () => {
    it('should throw when initializing from non-uninitialized state', async () => {
      await pipeline.initialize({
        canvas,
        config: {
          nativeWidth: 160,
          nativeHeight: 144,
          targetWidth: 640,
          targetHeight: 480
        }
      });

      await expect(
        pipeline.initialize({
          canvas,
          config: {
            nativeWidth: 160,
            nativeHeight: 144,
            targetWidth: 640,
            targetHeight: 480
          }
        })
      ).rejects.toThrow('Cannot initialize from state');
    });

    it('should throw when suspending from non-ready state', () => {
      expect(() => pipeline.suspend()).toThrow('Cannot suspend from state');
    });

    it('should throw when resuming from non-suspended state', async () => {
      await pipeline.initialize({
        canvas,
        config: {
          nativeWidth: 160,
          nativeHeight: 144,
          targetWidth: 640,
          targetHeight: 480
        }
      });

      await expect(pipeline.resume()).rejects.toThrow('Cannot resume from state');
    });

    it('should throw when resizing from invalid state', () => {
      expect(() => pipeline.resize(800, 600)).toThrow('Cannot resize from state');
    });
  });

  describe('Callbacks', () => {
    it('should call onError callback on error', async () => {
      const onError = vi.fn();
      pipeline.shouldThrowOnInit = true;

      try {
        await pipeline.initialize({
          canvas,
          config: {
            nativeWidth: 160,
            nativeHeight: 144,
            targetWidth: 640,
            targetHeight: 480
          },
          callbacks: { onError }
        });
      } catch {
      }

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INIT_FAILED',
          message: 'Init failed',
          recoverable: false
        })
      );
    });

    it('should call onStateChange callback on state transitions', async () => {
      const onStateChange = vi.fn();

      await pipeline.initialize({
        canvas,
        config: {
          nativeWidth: 160,
          nativeHeight: 144,
          targetWidth: 640,
          targetHeight: 480
        },
        callbacks: { onStateChange }
      });

      pipeline.suspend();
      await pipeline.resume();
      pipeline.dispose();

      expect(onStateChange).toHaveBeenNthCalledWith(1, 'ready');
      expect(onStateChange).toHaveBeenNthCalledWith(2, 'suspended');
      expect(onStateChange).toHaveBeenNthCalledWith(3, 'ready');
      expect(onStateChange).toHaveBeenNthCalledWith(4, 'disposed');
    });

    it('should call onStats callback after rendering frames', async () => {
      const onStats = vi.fn();

      await pipeline.initialize({
        canvas,
        config: {
          nativeWidth: 160,
          nativeHeight: 144,
          targetWidth: 640,
          targetHeight: 480
        },
        callbacks: { onStats }
      });

      const mockSource = canvas;
      const mockUniforms = {
        upscale: {
          inputSize: [160, 144],
          outputSize: [640, 480],
          scaleFactor: 4
        },
        unsharp: {
          texelSize: [1 / 640, 1 / 480],
          strength: 0,
          scaleFactor: 4
        },
        color: {
          gamma: 1.0,
          saturation: 1.0,
          greenBias: 0.0,
          brightness: 1.0,
          contrast: 1.0
        },
        crt: {
          resolution: [640, 480],
          scaleFactor: 4,
          scanlineStrength: 0,
          pixelMaskStrength: 0,
          bloomStrength: 0,
          curvature: 0,
          vignetteStrength: 0
        }
      };

      for (let i = 0; i < 61; i++) {
        pipeline.renderFrame(mockSource, mockUniforms);
        await new Promise(resolve => setTimeout(resolve, 20));
      }

      expect(onStats).toHaveBeenCalled();
    });

    it('should clear callbacks after dispose', async () => {
      const onError = vi.fn();
      const onStats = vi.fn();
      const onStateChange = vi.fn();

      await pipeline.initialize({
        canvas,
        config: {
          nativeWidth: 160,
          nativeHeight: 144,
          targetWidth: 640,
          targetHeight: 480
        },
        callbacks: { onError, onStats, onStateChange }
      });

      onStateChange.mockClear();
      pipeline.dispose();

      expect(pipeline.callbacks.onError).toBeUndefined();
      expect(pipeline.callbacks.onStats).toBeUndefined();
      expect(pipeline.callbacks.onStateChange).toBeUndefined();
    });
  });

  describe('Stats Tracking', () => {
    beforeEach(async () => {
      await pipeline.initialize({
        canvas,
        config: {
          nativeWidth: 160,
          nativeHeight: 144,
          targetWidth: 640,
          targetHeight: 480
        }
      });
    });

    it('should track frames rendered', () => {
      const mockSource = canvas;
      const mockUniforms = {
        upscale: {
          inputSize: [160, 144],
          outputSize: [640, 480],
          scaleFactor: 4
        },
        unsharp: {
          texelSize: [1 / 640, 1 / 480],
          strength: 0,
          scaleFactor: 4
        },
        color: {
          gamma: 1.0,
          saturation: 1.0,
          greenBias: 0.0,
          brightness: 1.0,
          contrast: 1.0
        },
        crt: {
          resolution: [640, 480],
          scaleFactor: 4,
          scanlineStrength: 0,
          pixelMaskStrength: 0,
          bloomStrength: 0,
          curvature: 0,
          vignetteStrength: 0
        }
      };

      pipeline.renderFrame(mockSource, mockUniforms);
      pipeline.renderFrame(mockSource, mockUniforms);
      pipeline.renderFrame(mockSource, mockUniforms);

      const stats = pipeline.getStats();
      expect(stats.framesRendered).toBe(3);
      expect(stats.framesDropped).toBe(0);
    });

    it('should track frames dropped on error', () => {
      pipeline.shouldThrowOnRender = true;

      const mockSource = canvas;
      const mockUniforms = {
        upscale: {
          inputSize: [160, 144],
          outputSize: [640, 480],
          scaleFactor: 4
        },
        unsharp: {
          texelSize: [1 / 640, 1 / 480],
          strength: 0,
          scaleFactor: 4
        },
        color: {
          gamma: 1.0,
          saturation: 1.0,
          greenBias: 0.0,
          brightness: 1.0,
          contrast: 1.0
        },
        crt: {
          resolution: [640, 480],
          scaleFactor: 4,
          scanlineStrength: 0,
          pixelMaskStrength: 0,
          bloomStrength: 0,
          curvature: 0,
          vignetteStrength: 0
        }
      };

      pipeline.renderFrame(mockSource, mockUniforms);
      pipeline.renderFrame(mockSource, mockUniforms);

      const stats = pipeline.getStats();
      expect(stats.framesDropped).toBe(2);
    });

    it('should calculate rolling average FPS', () => {
      const mockSource = canvas;
      const mockUniforms = {
        upscale: {
          inputSize: [160, 144],
          outputSize: [640, 480],
          scaleFactor: 4
        },
        unsharp: {
          texelSize: [1 / 640, 1 / 480],
          strength: 0,
          scaleFactor: 4
        },
        color: {
          gamma: 1.0,
          saturation: 1.0,
          greenBias: 0.0,
          brightness: 1.0,
          contrast: 1.0
        },
        crt: {
          resolution: [640, 480],
          scaleFactor: 4,
          scanlineStrength: 0,
          pixelMaskStrength: 0,
          bloomStrength: 0,
          curvature: 0,
          vignetteStrength: 0
        }
      };

      for (let i = 0; i < 10; i++) {
        pipeline.renderFrame(mockSource, mockUniforms);
      }

      const stats = pipeline.getStats();
      expect(stats.fps).toBeGreaterThan(0);
      expect(stats.frameTime).toBeGreaterThan(0);
    });

    it('should limit rolling window to 60 frames', () => {
      const mockSource = canvas;
      const mockUniforms = {
        upscale: {
          inputSize: [160, 144],
          outputSize: [640, 480],
          scaleFactor: 4
        },
        unsharp: {
          texelSize: [1 / 640, 1 / 480],
          strength: 0,
          scaleFactor: 4
        },
        color: {
          gamma: 1.0,
          saturation: 1.0,
          greenBias: 0.0,
          brightness: 1.0,
          contrast: 1.0
        },
        crt: {
          resolution: [640, 480],
          scaleFactor: 4,
          scanlineStrength: 0,
          pixelMaskStrength: 0,
          bloomStrength: 0,
          curvature: 0,
          vignetteStrength: 0
        }
      };

      for (let i = 0; i < 100; i++) {
        pipeline.renderFrame(mockSource, mockUniforms);
      }

      const stats = pipeline.getStats();
      expect(stats.framesRendered).toBe(100);
    });
  });

  describe('Error Handling', () => {
    it('should classify errors correctly', async () => {
      const onError = vi.fn();
      pipeline.shouldThrowOnInit = true;

      try {
        await pipeline.initialize({
          canvas,
          config: {
            nativeWidth: 160,
            nativeHeight: 144,
            targetWidth: 640,
            targetHeight: 480
          },
          callbacks: { onError }
        });
      } catch {
      }

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INIT_FAILED',
          recoverable: false,
          adapterInfo: expect.objectContaining({
            api: 'canvas2d'
          })
        })
      );
    });

    it('should store last error', async () => {
      pipeline.shouldThrowOnInit = true;

      try {
        await pipeline.initialize({
          canvas,
          config: {
            nativeWidth: 160,
            nativeHeight: 144,
            targetWidth: 640,
            targetHeight: 480
          }
        });
      } catch {
      }

      const error = pipeline.lastError;
      expect(error).toBeTruthy();
      expect(error?.code).toBe('INIT_FAILED');
    });

    it('should not transition to error state on recoverable error', async () => {
      await pipeline.initialize({
        canvas,
        config: {
          nativeWidth: 160,
          nativeHeight: 144,
          targetWidth: 640,
          targetHeight: 480
        }
      });

      pipeline.shouldThrowOnRender = true;

      const mockSource = canvas;
      const mockUniforms = {
        upscale: {
          inputSize: [160, 144],
          outputSize: [640, 480],
          scaleFactor: 4
        },
        unsharp: {
          texelSize: [1 / 640, 1 / 480],
          strength: 0,
          scaleFactor: 4
        },
        color: {
          gamma: 1.0,
          saturation: 1.0,
          greenBias: 0.0,
          brightness: 1.0,
          contrast: 1.0
        },
        crt: {
          resolution: [640, 480],
          scaleFactor: 4,
          scanlineStrength: 0,
          pixelMaskStrength: 0,
          bloomStrength: 0,
          curvature: 0,
          vignetteStrength: 0
        }
      };

      pipeline.renderFrame(mockSource, mockUniforms);
      expect(pipeline.state).toBe('ready');
    });
  });

  describe('Render Frame', () => {
    beforeEach(async () => {
      await pipeline.initialize({
        canvas,
        config: {
          nativeWidth: 160,
          nativeHeight: 144,
          targetWidth: 640,
          targetHeight: 480
        }
      });
    });

    it('should not render when not in ready state', () => {
      pipeline.suspend();

      const mockSource = canvas;
      const mockUniforms = {
        upscale: {
          inputSize: [160, 144],
          outputSize: [640, 480],
          scaleFactor: 4
        },
        unsharp: {
          texelSize: [1 / 640, 1 / 480],
          strength: 0,
          scaleFactor: 4
        },
        color: {
          gamma: 1.0,
          saturation: 1.0,
          greenBias: 0.0,
          brightness: 1.0,
          contrast: 1.0
        },
        crt: {
          resolution: [640, 480],
          scaleFactor: 4,
          scanlineStrength: 0,
          pixelMaskStrength: 0,
          bloomStrength: 0,
          curvature: 0,
          vignetteStrength: 0
        }
      };

      pipeline.renderFrameCalled = false;
      pipeline.renderFrame(mockSource, mockUniforms);
      expect(pipeline.renderFrameCalled).toBe(false);
    });
  });

  describe('Resize', () => {
    beforeEach(async () => {
      await pipeline.initialize({
        canvas,
        config: {
          nativeWidth: 160,
          nativeHeight: 144,
          targetWidth: 640,
          targetHeight: 480
        }
      });
    });

    it('should update canvas dimensions', () => {
      pipeline.resize(800, 600);
      expect(canvas.width).toBe(800);
      expect(canvas.height).toBe(600);
    });

    it('should call onResize hook', () => {
      pipeline.resize(800, 600);
      expect(pipeline.resizeCalled).toBe(true);
    });

    it('should allow resize when suspended', async () => {
      pipeline.suspend();
      expect(() => pipeline.resize(800, 600)).not.toThrow();
    });
  });

  describe('Dispose', () => {
    it('should be idempotent', async () => {
      await pipeline.initialize({
        canvas,
        config: {
          nativeWidth: 160,
          nativeHeight: 144,
          targetWidth: 640,
          targetHeight: 480
        }
      });

      pipeline.dispose();
      expect(() => pipeline.dispose()).not.toThrow();
      expect(pipeline.state).toBe('disposed');
    });
  });
});
