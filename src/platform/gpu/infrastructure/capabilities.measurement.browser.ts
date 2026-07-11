import type {
  BrowserCapabilityProbeError,
  BrowserCapabilityProbeResult,
  OffscreenCanvasTransferProbeResult,
  WebGpuCapabilityProbeResult
} from '../domain/types';

export type {
  BrowserCapabilityProbeError,
  BrowserCapabilityProbeResult,
  OffscreenCanvasTransferProbeResult,
  WebGpuCapabilityProbeResult
} from '../domain/types';

export interface BrowserGpuProbeDevice {
  destroy(): void;
}

export interface BrowserGpuProbeAdapter {
  requestDevice(): Promise<BrowserGpuProbeDevice>;
}

export interface BrowserGpuProbeApi {
  requestAdapter(): Promise<BrowserGpuProbeAdapter | null>;
}

export interface BrowserTransferProbeCanvas {
  transferControlToOffscreen?: () => unknown;
  remove?: () => void;
}

export interface BrowserGpuProbeApis {
  readonly gpu?: BrowserGpuProbeApi;
  readonly offscreenCanvas?: unknown;
  readonly createTransferCanvas?: () => BrowserTransferProbeCanvas;
  readonly isAllowlistedTransferNotSupported?: (error: unknown) => boolean;
}

function describeProbeError(error: unknown): BrowserCapabilityProbeError {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message
    };
  }

  try {
    return {
      name: 'NonErrorThrown',
      message: String(error)
    };
  } catch {
    return {
      name: 'NonErrorThrown',
      message: '[unstringifiable error]'
    };
  }
}

function isDefaultAllowlistedTransferNotSupported(error: unknown): boolean {
  return typeof DOMException !== 'undefined'
    && error instanceof DOMException
    && error.name === 'NotSupportedError';
}

async function probeWebGpu(gpu: BrowserGpuProbeApi | undefined): Promise<WebGpuCapabilityProbeResult> {
  if (!gpu) return { status: 'api-unavailable' };

  let device: BrowserGpuProbeDevice | undefined;
  let result: WebGpuCapabilityProbeResult;

  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      result = { status: 'adapter-unavailable' };
    } else {
      try {
        device = await adapter.requestDevice();
        result = { status: 'available' };
      } catch (error) {
        result = { status: 'device-error', error: describeProbeError(error) };
      }
    }
  } catch (error) {
    result = { status: 'adapter-error', error: describeProbeError(error) };
  } finally {
    if (device) {
      try {
        device.destroy();
      } catch (error) {
        result = { status: 'device-error', error: describeProbeError(error) };
      }
    }
  }

  return result!;
}

function classifyTransferError(
  error: unknown,
  isAllowlistedTransferNotSupported: ((error: unknown) => boolean) | undefined
): OffscreenCanvasTransferProbeResult {
  try {
    const allowlisted = isAllowlistedTransferNotSupported
      ? isAllowlistedTransferNotSupported(error)
      : isDefaultAllowlistedTransferNotSupported(error);
    return allowlisted
      ? { status: 'allowlisted-not-supported' }
      : { status: 'unexpected-error', error: describeProbeError(error) };
  } catch (classifierError) {
    return { status: 'unexpected-error', error: describeProbeError(classifierError) };
  }
}

function probeOffscreenCanvasTransfer(apis: BrowserGpuProbeApis): OffscreenCanvasTransferProbeResult {
  if (apis.offscreenCanvas === undefined || apis.offscreenCanvas === null) {
    return { status: 'api-unavailable' };
  }
  if (!apis.createTransferCanvas) return { status: 'method-unavailable' };

  const references: {
    canvas: BrowserTransferProbeCanvas | undefined;
    offscreenCanvas: unknown;
  } = {
    canvas: undefined,
    offscreenCanvas: undefined
  };
  let result: OffscreenCanvasTransferProbeResult = { status: 'method-unavailable' };

  try {
    references.canvas = apis.createTransferCanvas();
    const transfer = references.canvas.transferControlToOffscreen;
    if (typeof transfer === 'function') {
      try {
        references.offscreenCanvas = transfer.call(references.canvas);
        result = { status: 'available' };
      } catch (error) {
        result = classifyTransferError(error, apis.isAllowlistedTransferNotSupported);
      }
    }
  } catch (error) {
    result = { status: 'unexpected-error', error: describeProbeError(error) };
  } finally {
    try {
      references.canvas?.remove?.();
    } catch (error) {
      result = { status: 'unexpected-error', error: describeProbeError(error) };
    } finally {
      references.offscreenCanvas = undefined;
      references.canvas = undefined;
    }
  }

  return result;
}

function defaultBrowserGpuProbeApis(): BrowserGpuProbeApis {
  const gpu = typeof navigator === 'undefined' ? undefined : navigator.gpu;
  const offscreenCanvas = typeof OffscreenCanvas === 'undefined' ? undefined : OffscreenCanvas;
  const createTransferCanvas = typeof document === 'undefined'
    ? undefined
    : () => document.createElement('canvas');

  return {
    ...(gpu ? { gpu } : {}),
    ...(offscreenCanvas ? { offscreenCanvas } : {}),
    ...(createTransferCanvas ? { createTransferCanvas } : {})
  };
}

export async function probeBrowserGpuCapabilities(
  apis: BrowserGpuProbeApis = defaultBrowserGpuProbeApis()
): Promise<BrowserCapabilityProbeResult> {
  const [webgpu, transferControlToOffscreen] = await Promise.all([
    probeWebGpu(apis.gpu),
    probeOffscreenCanvasTransfer(apis)
  ]);

  return { webgpu, transferControlToOffscreen };
}
