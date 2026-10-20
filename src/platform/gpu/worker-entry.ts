import { startRenderWorkerHost, type RenderWorkerScope } from './worker/render-worker.host';

startRenderWorkerHost(self as unknown as RenderWorkerScope);
