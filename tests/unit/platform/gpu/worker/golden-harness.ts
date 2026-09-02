import { vi } from 'vitest';
import * as Comlink from 'comlink';
import {
  CONTROL_PORT_MESSAGE,
  isPerformanceHarnessBuild,
  type WorkerCaptureReadyPayload,
  type WorkerControlApi,
  type WorkerReadyPayload
} from '../../../../../src/platform/gpu/worker/protocol';
import type {
  WebGpuFrameRequestProxy,
  WebGpuLifecycleInstrumentationObserver
} from '../../../../../src/platform/gpu/domain/types';

/**
 * Transport-agnostic golden-test harness. Touches ONLY the WorkerRendererClient
 * public API and the createGpuRenderer seam. Identical across pre/post-port trees.
 */

export type DriverRecord = string[];

export type RecordingDriverHandle = {
  record: DriverRecord;
  reset(): void;
};

export const TEST_WEBGPU_BACKEND_EXECUTION_IDENTITY = Object.freeze({
  backend: 'webgpu' as const,
  driver: 'webgpu-driver-v1' as const,
  workerProtocol: 'webgpu-worker-ready-v1' as const,
  adapterIdentity: Object.freeze({
    vendor: 'test-vendor',
    architecture: 'test-architecture',
    device: 'test-device',
    description: 'test-adapter'
  }),
  limits: Object.freeze({ maxTextureDimension2D: 8192, maxBindGroups: 8 }),
  isFallbackAdapter: false,
  powerPreference: 'low-power' as const
});

export function createRecordingDriver(mockCreateGpuRenderer: ReturnType<typeof vi.fn>): RecordingDriverHandle {
  const record: DriverRecord = [];
  mockCreateGpuRenderer.mockImplementation(async (opts: {
    nativeWidth: number;
    nativeHeight: number;
    lifecycleInstrumentationObserver?: WebGpuLifecycleInstrumentationObserver;
  }) => {
    record.push(`create:${opts.nativeWidth}x${opts.nativeHeight}`);
    opts.lifecycleInstrumentationObserver?.recordWebGpuLifecycleRequestProxy({
      lifecyclePhase: 'startup',
      operationId: 'gpu-texture-request',
      sourceLocationId: 'webgpu-driver:create-texture',
      outcome: 'success',
      byteKind: 'logical-texel-footprint',
      byteValue: opts.nativeWidth * opts.nativeHeight * 4,
      textureDescriptor: {
        width: opts.nativeWidth,
        height: opts.nativeHeight,
        depth: 1,
        format: 'rgba8unorm',
        usage: 'texture-binding-copy-dst-render-attachment',
        logicalTexelFootprint: opts.nativeWidth * opts.nativeHeight * 4
      }
    });
    for (let index = 0; index < 2; index++) {
      opts.lifecycleInstrumentationObserver?.recordWebGpuLifecycleRequestProxy({
        lifecyclePhase: 'startup',
        operationId: 'gpu-texture-request',
        sourceLocationId: 'webgpu-driver:create-texture',
        outcome: 'success',
        byteKind: 'logical-texel-footprint',
        byteValue: 640 * 576 * 4,
        textureDescriptor: {
          width: 640,
          height: 576,
          depth: 1,
          format: 'rgba8unorm',
          usage: 'texture-binding-render-attachment',
          logicalTexelFootprint: 640 * 576 * 4
        }
      });
    }
    for (let index = 0; index < 4; index++) {
      opts.lifecycleInstrumentationObserver?.recordWebGpuLifecycleRequestProxy({
        lifecyclePhase: 'startup',
        operationId: 'gpu-buffer-request',
        sourceLocationId: 'webgpu-driver:create-buffer',
        outcome: 'success',
        byteKind: 'descriptor-size',
        byteValue: 64,
        descriptorSize: 64
      });
    }
    return {
      backend: 'webgpu',
      getBackendExecutionIdentity: () => TEST_WEBGPU_BACKEND_EXECUTION_IDENTITY,
      renderFrame: (
        src: unknown,
        instrumentationObserver?: {
          recordWebGpuQueueSubmitTiming(startedAt: number, endedAt: number): void;
          recordWebGpuFrameRequestProxy(request: WebGpuFrameRequestProxy): void;
        }
      ) => {
        record.push(`render:${(src as { sig?: string }).sig ?? '?'}`);
        instrumentationObserver?.recordWebGpuFrameRequestProxy({
          operationId: 'uniform-float32-array',
          sourceLocationId: 'webgpu-driver:uniform-float32-array',
          outcome: 'success',
          byteKind: 'requested-byte-length',
          byteValue: 96,
          requestedByteLength: 96
        });
        instrumentationObserver?.recordWebGpuFrameRequestProxy({
          operationId: 'render-pass-plan-materialization',
          sourceLocationId: 'webgpu-driver:materialize-render-plan',
          outcome: 'success',
          byteKind: 'count-only-unavailable',
          byteValue: null
        });
        instrumentationObserver?.recordWebGpuFrameRequestProxy({
          operationId: 'bind-group-create',
          sourceLocationId: 'webgpu-driver:create-bind-group',
          outcome: 'success',
          byteKind: 'count-only-unavailable',
          byteValue: null
        });
        const queueSubmitStartedAt = performance.now();
        instrumentationObserver?.recordWebGpuQueueSubmitTiming(queueSubmitStartedAt, performance.now());
        return { outcome: 'webgpu-queue-submit-completed' as const };
      },
      resize: (
        w: number,
        h: number,
        lifecycleInstrumentationObserver?: WebGpuLifecycleInstrumentationObserver
      ) => {
        record.push(`resize:${w}x${h}`);
        for (let index = 0; index < 2; index++) {
          lifecycleInstrumentationObserver?.recordWebGpuLifecycleRequestProxy({
            lifecyclePhase: 'resize',
            operationId: 'gpu-texture-request',
            sourceLocationId: 'webgpu-driver:create-texture',
            outcome: 'success',
            byteKind: 'logical-texel-footprint',
            byteValue: w * h * 4,
            textureDescriptor: {
              width: w,
              height: h,
              depth: 1,
              format: 'rgba8unorm',
              usage: 'texture-binding-render-attachment',
              logicalTexelFootprint: w * h * 4
            }
          });
        }
      },
      captureFrame: async () => new Uint8Array([9, 8, 7, 6]).buffer,
      getStats: () => ({ fps: 0, frameTime: 0, framesRendered: 0, framesDropped: 0 }),
      dispose: async () => {
        record.push('dispose');
      },
      setPreset: (p: { id?: string }) => {
        record.push(`setPreset:${p.id ?? '?'}`);
      },
      setBrightness: (v: number) => {
        record.push(`setBrightness:${v}`);
      }
    };
  });
  return {
    record,
    reset: () => {
      record.length = 0;
    }
  };
}

/**
 * A deterministic fake ImageBitmap. `sig` is a stable function of the frame index,
 * so the byte crossing the render seam is reproducible.
 */
export function makeDeterministicFrame(index: number): ImageBitmap {
  const bytes = new Uint8Array(8);
  let acc = (index * 2654435761) >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    acc = (acc ^ (acc << 13)) >>> 0;
    acc = (acc ^ (acc >>> 17)) >>> 0;
    acc = (acc ^ (acc << 5)) >>> 0;
    bytes[i] = acc & 0xff;
  }
  const sig = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return { sig, close: () => {} } as unknown as ImageBitmap;
}

export function fnv1aHex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function hashRecord(record: DriverRecord): string {
  return fnv1aHex(record.join('|'));
}

/**
 * FakeWorker bridges the WorkerRendererClient (main-thread side) to
 * startWorkerRendererService (worker-scope side) in-process, relaying messages
 * and transferables by reference. Transport-agnostic: it faithfully relays raw
 * postMessage in both directions; the service is free to additionally create a
 * dedicated control MessagePort (comlink) and hand one end back through it.
 */
export type WorkerServiceScope = {
  onmessage: ((event: MessageEvent<unknown>) => void | Promise<void>) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  close(): void;
};

export class FakeWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  private readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();
  readonly scope: WorkerServiceScope;

  constructor() {
    const worker = this;
    this.scope = {
      onmessage: null,
      postMessage(message: unknown): void {
        queueMicrotask(() => {
          const event = { data: message } as MessageEvent<unknown>;
          worker.onmessage?.(event);
          worker.listeners.forEach((listener) => listener(event));
        });
      },
      close(): void {}
    };
  }

  postMessage(message: unknown): void {
    queueMicrotask(() => {
      void this.scope.onmessage?.({ data: message } as MessageEvent<unknown>);
    });
  }

  addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void {
    if (type === 'message') this.listeners.add(listener);
  }

  removeEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void {
    if (type === 'message') this.listeners.delete(listener);
  }

  terminate(): void {}
}

/**
 * Builds a FakeWorker whose worker-side control API is exposed over comlink on
 * a dedicated MessagePort, handed back to the client via the CONTROL_PORT_MESSAGE
 * handoff. `api` overrides let callers spy on or replace individual control methods.
 */
export function stubControlWorker(api: Partial<WorkerControlApi> = {}): FakeWorker {
  const worker = new FakeWorker();
  const channel = new MessageChannel();
  Comlink.expose(
    {
      initialize: async (): Promise<WorkerReadyPayload> => isPerformanceHarnessBuild
        ? { backend: 'webgpu', backendExecutionIdentity: TEST_WEBGPU_BACKEND_EXECUTION_IDENTITY }
        : { backend: 'webgpu' },
      resize: async () => {},
      setPreset: async () => {},
      setBrightness: async () => {},
      requestCapture: async () => {},
      getCapturedFrame: async (): Promise<WorkerCaptureReadyPayload> => ({
        bitmap: { close: () => {} } as unknown as ImageBitmap
      }),
      release: async () => {},
      destroy: async () => {},
      ...api
    },
    channel.port1
  );
  queueMicrotask(() =>
    worker.onmessage?.({ data: { channel: CONTROL_PORT_MESSAGE, port: channel.port2 } } as MessageEvent)
  );
  return worker;
}

export async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
