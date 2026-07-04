import { startWorkerRendererService, type WorkerRendererServiceScope } from './worker/service';

startWorkerRendererService(self as unknown as WorkerRendererServiceScope);
