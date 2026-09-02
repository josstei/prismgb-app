import type {
  BrowserCapabilityProbeError,
  BrowserCapabilityProbeResult,
  BrowserGpuAdapterIdentity,
  BrowserGpuQualificationLimits,
  BrowserGpuStrictSelection,
  OffscreenCanvasTransferProbeResult,
  WebGpuCapabilityProbeResult
} from '../domain/types';

export type {
  BrowserCapabilityProbeError,
  BrowserCapabilityProbeResult,
  BrowserGpuAdapterIdentity,
  BrowserGpuQualificationLimits,
  BrowserGpuStrictSelection,
  OffscreenCanvasTransferProbeResult,
  WebGpuCapabilityProbeResult
} from '../domain/types';

export interface BrowserGpuProbeDevice {
  readonly limits: Readonly<{
    readonly maxTextureDimension2D: number;
    readonly maxBindGroups: number;
  }>;
  destroy(): void;
}

export interface BrowserGpuProbeAdapter {
  readonly info: Readonly<{
    readonly vendor: string;
    readonly architecture: string;
    readonly device: string;
    readonly description: string;
    readonly isFallbackAdapter: boolean;
  }>;
  requestDevice(): Promise<BrowserGpuProbeDevice>;
}

export interface BrowserGpuProbeApi {
  requestAdapter(options: Readonly<{
    readonly powerPreference: 'low-power';
    readonly forceFallbackAdapter: false;
  }>): Promise<BrowserGpuProbeAdapter | null>;
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

const STRICT_SELECTION: BrowserGpuStrictSelection = Object.freeze({
  requestedBackend: 'webgpu',
  powerPreference: 'low-power',
  forceFallbackAdapter: false
});

function sanitizeAdapterIdentity(info: BrowserGpuProbeAdapter['info']): BrowserGpuAdapterIdentity {
  const sanitize = (value: string): string | null => {
    const normalized = value.trim().replace(/\s+/g, ' ');
    return normalized.length === 0 ? null : normalized;
  };
  return Object.freeze({
    vendor: sanitize(info.vendor),
    architecture: sanitize(info.architecture),
    device: sanitize(info.device),
    description: sanitize(info.description)
  });
}

function qualificationLimits(device: BrowserGpuProbeDevice): BrowserGpuQualificationLimits {
  const { maxTextureDimension2D, maxBindGroups } = device.limits;
  if (
    !Number.isSafeInteger(maxTextureDimension2D) || maxTextureDimension2D <= 0 ||
    !Number.isSafeInteger(maxBindGroups) || maxBindGroups <= 0
  ) {
    throw new TypeError('WebGPU qualification device limits are invalid');
  }
  return Object.freeze({ maxTextureDimension2D, maxBindGroups });
}

async function probeWebGpu(gpu: BrowserGpuProbeApi | undefined): Promise<WebGpuCapabilityProbeResult> {
  if (!gpu) return { status: 'api-unavailable' };

  let device: BrowserGpuProbeDevice | undefined;
  let result: WebGpuCapabilityProbeResult;

  try {
    const adapter = await gpu.requestAdapter({
      powerPreference: STRICT_SELECTION.powerPreference,
      forceFallbackAdapter: STRICT_SELECTION.forceFallbackAdapter
    });
    if (!adapter) {
      result = { status: 'adapter-unavailable' };
    } else {
      try {
        device = await adapter.requestDevice();
        if (typeof adapter.info.isFallbackAdapter !== 'boolean') {
          throw new TypeError('WebGPU qualification adapter fallback status is invalid');
        }
        result = {
          status: 'available',
          adapterIdentity: sanitizeAdapterIdentity(adapter.info),
          limits: qualificationLimits(device),
          isFallbackAdapter: adapter.info.isFallbackAdapter,
          strictSelection: STRICT_SELECTION
        };
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
