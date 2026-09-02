import { describe, expect, it, vi } from 'vitest';
import {
  probeBrowserGpuCapabilities,
  type BrowserGpuProbeApis
} from '../../../../../src/platform/gpu/infrastructure/capabilities.measurement.browser';

function availableGpu() {
  const destroy = vi.fn();
  const limits = { maxTextureDimension2D: 8192, maxBindGroups: 8 };
  const info = {
    vendor: '  Example   Vendor  ',
    architecture: 'Example Architecture',
    device: 'Example Device',
    description: '  Example   Adapter ',
    isFallbackAdapter: false
  };
  const requestDevice = vi.fn(async () => ({ destroy, limits }));
  const requestAdapter = vi.fn(async () => ({ requestDevice, info }));

  return { gpu: { requestAdapter }, requestAdapter, requestDevice, destroy, info, limits };
}

function availableTransfer() {
  const remove = vi.fn();
  const transferControlToOffscreen = vi.fn(() => ({}));

  return {
    offscreenCanvas: {},
    createTransferCanvas: () => ({ transferControlToOffscreen, remove }),
    remove,
    transferControlToOffscreen
  };
}

function probeApis(overrides: Partial<BrowserGpuProbeApis> = {}): BrowserGpuProbeApis {
  const gpu = availableGpu();
  const transfer = availableTransfer();

  return {
    gpu: gpu.gpu,
    offscreenCanvas: transfer.offscreenCanvas,
    createTransferCanvas: transfer.createTransferCanvas,
    ...overrides
  };
}

describe('probeBrowserGpuCapabilities', () => {
  it('reports a missing WebGPU API without changing the transfer probe result', async () => {
    const result = await probeBrowserGpuCapabilities(probeApis({ gpu: undefined }));

    expect(result).toEqual({
      webgpu: { status: 'api-unavailable' },
      transferControlToOffscreen: { status: 'available' }
    });
  });

  it('distinguishes a null adapter from an adapter request error', async () => {
    const nullAdapter = vi.fn(async () => null);
    const adapterError = new Error('adapter failed');
    const throwingAdapter = vi.fn(async () => {
      throw adapterError;
    });

    const unavailable = await probeBrowserGpuCapabilities(probeApis({
      gpu: { requestAdapter: nullAdapter }
    }));
    const failed = await probeBrowserGpuCapabilities(probeApis({
      gpu: { requestAdapter: throwingAdapter }
    }));

    expect(unavailable.webgpu).toEqual({ status: 'adapter-unavailable' });
    expect(failed.webgpu).toEqual({
      status: 'adapter-error',
      error: { name: 'Error', message: 'adapter failed' }
    });
    expect(nullAdapter).toHaveBeenCalledTimes(1);
    expect(throwingAdapter).toHaveBeenCalledTimes(1);
  });

  it('records device request errors without retrying the adapter or device request', async () => {
    const deviceError = new Error('device failed');
    const requestDevice = vi.fn(async () => {
      throw deviceError;
    });
    const requestAdapter = vi.fn(async () => ({
      requestDevice,
      info: availableGpu().info
    }));

    const result = await probeBrowserGpuCapabilities(probeApis({
      gpu: { requestAdapter }
    }));

    expect(result.webgpu).toEqual({
      status: 'device-error',
      error: { name: 'Error', message: 'device failed' }
    });
    expect(requestAdapter).toHaveBeenCalledTimes(1);
    expect(requestDevice).toHaveBeenCalledTimes(1);
  });

  it('reports transfer API and method absence independently', async () => {
    const createTransferCanvas = vi.fn(() => ({ remove: vi.fn() }));

    const apiUnavailable = await probeBrowserGpuCapabilities(probeApis({
      offscreenCanvas: undefined,
      createTransferCanvas
    }));
    const methodUnavailable = await probeBrowserGpuCapabilities(probeApis({
      createTransferCanvas
    }));

    expect(apiUnavailable.transferControlToOffscreen).toEqual({ status: 'api-unavailable' });
    expect(methodUnavailable.transferControlToOffscreen).toEqual({ status: 'method-unavailable' });
    expect(createTransferCanvas).toHaveBeenCalledTimes(1);
  });

  it('allows only an explicitly allowlisted unsupported transfer error', async () => {
    const unsupported = new Error('not supported here');
    const remove = vi.fn();
    const transferControlToOffscreen = vi.fn(() => {
      throw unsupported;
    });

    const result = await probeBrowserGpuCapabilities(probeApis({
      createTransferCanvas: () => ({ transferControlToOffscreen, remove }),
      isAllowlistedTransferNotSupported: (error) => error === unsupported
    }));

    expect(result.transferControlToOffscreen).toEqual({ status: 'allowlisted-not-supported' });
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('preserves unexpected transfer errors and clears the temporary canvas after failure', async () => {
    const unexpected = new Error('transfer failed');
    const remove = vi.fn();
    const transferControlToOffscreen = vi.fn(() => {
      throw unexpected;
    });

    const result = await probeBrowserGpuCapabilities(probeApis({
      createTransferCanvas: () => ({ transferControlToOffscreen, remove })
    }));

    expect(result.transferControlToOffscreen).toEqual({
      status: 'unexpected-error',
      error: { name: 'Error', message: 'transfer failed' }
    });
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('uses one adapter and device request, destroys the device, and clears the transfer canvas', async () => {
    const gpu = availableGpu();
    const transfer = availableTransfer();

    const result = await probeBrowserGpuCapabilities({
      gpu: gpu.gpu,
      offscreenCanvas: transfer.offscreenCanvas,
      createTransferCanvas: transfer.createTransferCanvas
    });

    expect(result).toEqual({
      webgpu: {
        status: 'available',
        adapterIdentity: {
          vendor: 'Example Vendor',
          architecture: 'Example Architecture',
          device: 'Example Device',
          description: 'Example Adapter'
        },
        limits: { maxTextureDimension2D: 8192, maxBindGroups: 8 },
        isFallbackAdapter: false,
        strictSelection: {
          requestedBackend: 'webgpu',
          powerPreference: 'low-power',
          forceFallbackAdapter: false
        }
      },
      transferControlToOffscreen: { status: 'available' }
    });
    expect(gpu.requestAdapter).toHaveBeenCalledWith({
      powerPreference: 'low-power',
      forceFallbackAdapter: false
    });
    expect(gpu.requestAdapter).toHaveBeenCalledTimes(1);
    expect(gpu.requestDevice).toHaveBeenCalledTimes(1);
    expect(gpu.destroy).toHaveBeenCalledTimes(1);
    expect(transfer.transferControlToOffscreen).toHaveBeenCalledTimes(1);
    expect(transfer.remove).toHaveBeenCalledTimes(1);
  });

  it('preserves a fallback adapter result and destroys its device', async () => {
    const gpu = availableGpu();
    gpu.info.isFallbackAdapter = true;

    const result = await probeBrowserGpuCapabilities({
      gpu: gpu.gpu,
      ...availableTransfer()
    });

    expect(result.webgpu).toMatchObject({
      status: 'available',
      isFallbackAdapter: true,
      adapterIdentity: { vendor: 'Example Vendor' }
    });
    expect(gpu.destroy).toHaveBeenCalledTimes(1);
  });

  it('reports invalid adapter metadata or limits as a device error after cleanup', async () => {
    const gpu = availableGpu();
    gpu.info.isFallbackAdapter = undefined as unknown as boolean;

    const result = await probeBrowserGpuCapabilities({
      gpu: gpu.gpu,
      ...availableTransfer()
    });

    expect(result.webgpu).toEqual({
      status: 'device-error',
      error: {
        name: 'TypeError',
        message: 'WebGPU qualification adapter fallback status is invalid'
      }
    });
    expect(gpu.destroy).toHaveBeenCalledTimes(1);
  });
});
