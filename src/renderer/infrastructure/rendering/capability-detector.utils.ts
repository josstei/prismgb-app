import { detectCapabilities as detectBase } from '@prismgb/gpu';
import type { IPipelineCapabilities } from '@prismgb/gpu';

interface RendererCapabilities extends IPipelineCapabilities {
  gpuPolicyApplied: boolean;
  gpuPolicyReason: string | null;
}

async function getGpuPolicyWithFallback() {
  try {
    if (window.gpuAPI?.getPolicy) {
      return await window.gpuAPI.getPolicy();
    }
  } catch {
  }

  const ua = navigator.userAgent;
  const isLinuxArm = ua.includes('Linux') &&
    (ua.includes('aarch64') || ua.includes('arm'));
  if (isLinuxArm) {
    return {
      skipWebGPU: true,
      reason: 'ARM Linux detected via userAgent'
    };
  }

  return { skipWebGPU: false, reason: null };
}

async function detectCapabilities(): Promise<RendererCapabilities> {
  const gpuPolicy = await getGpuPolicyWithFallback();
  const base = await detectBase();

  if (gpuPolicy.skipWebGPU) {
    return {
      ...base,
      webgpu: false,
      preferredAPI: base.webgl2 ? 'webgl2' : 'canvas2d',
      gpuPolicyApplied: true,
      gpuPolicyReason: gpuPolicy.reason
    };
  }

  return {
    ...base,
    gpuPolicyApplied: false,
    gpuPolicyReason: null
  };
}

function isGPURenderingAvailable(capabilities: RendererCapabilities): boolean {
  return capabilities.webgpu || capabilities.webgl2;
}

function isWorkerRenderingAvailable(capabilities: RendererCapabilities): boolean {
  return capabilities.transferControlToOffscreen &&
    (capabilities.webgpu || capabilities.webgl2);
}

function describeCapabilities(capabilities: RendererCapabilities): string {
  const parts: string[] = [];

  if (capabilities.gpuPolicyApplied) {
    parts.push(`WebGPU skipped (${capabilities.gpuPolicyReason})`);
  } else if (capabilities.webgpu) {
    parts.push(`WebGPU (max texture: ${capabilities.webgpuLimits?.maxTextureDimension2D}px)`);
  }

  if (capabilities.webgl2) {
    parts.push(`WebGL2 (${capabilities.webgl2Info?.renderer || 'unknown GPU'})`);
  }

  if (capabilities.transferControlToOffscreen) {
    parts.push('OffscreenCanvas Worker');
  }

  if (parts.length === 0) {
    parts.push('Canvas2D only');
  }

  return `GPU Capabilities: ${parts.join(', ')} - Using: ${capabilities.preferredAPI}`;
}

export const CapabilityDetector = {
  detect: detectCapabilities,
  isGPURenderingAvailable,
  isWorkerRenderingAvailable,
  describeCapabilities
};
