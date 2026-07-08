import { startWorkerRendererService, type WorkerRendererServiceScope } from './worker/runtime';

startWorkerRendererService(self as unknown as WorkerRendererServiceScope);
