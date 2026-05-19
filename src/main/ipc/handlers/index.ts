/**
 * IPC Handlers
 * Barrel export for all IPC handler registration functions.
 */

export { registerDeviceHandlers } from './device.handler.js';
export { deviceHandlerDescriptors } from './device.handler.js';
export type { DeviceHandlerDependencies } from './device.handler.js';

export { registerUpdateHandlers } from './update.handler.js';
export { updateHandlerDescriptors } from './update.handler.js';
export type { UpdateHandlerDependencies } from './update.handler.js';

export { registerTranscodeHandlers } from './transcode.handler.js';
export { transcodeHandlerDescriptors } from './transcode.handler.js';
export type { TranscodeHandlerDependencies } from './transcode.handler.js';

export { registerWindowHandlers } from './window.handler.js';
export { windowHandlerDescriptors } from './window.handler.js';
export type { WindowHandlerDependencies } from './window.handler.js';

export { registerShellHandlers } from './shell.handler.js';
export { shellHandlerDescriptors } from './shell.handler.js';
export type { ShellHandlerDependencies } from './shell.handler.js';

export { registerPerformanceHandlers } from './performance.handler.js';
export { performanceHandlerDescriptors } from './performance.handler.js';
export type { PerformanceHandlerDependencies } from './performance.handler.js';

export { registerGpuHandlers } from './gpu.handler.js';
export { gpuHandlerDescriptors } from './gpu.handler.js';
export type { GpuHandlerDependencies } from './gpu.handler.js';

export { registerLoginItemHandlers } from './login-item.handler.js';
export { loginItemHandlerDescriptors } from './login-item.handler.js';
export type { LoginItemHandlerDependencies } from './login-item.handler.js';
