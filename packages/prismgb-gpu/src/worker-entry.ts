import { installWorkerRenderer, type WorkerScopeLike } from './worker/renderer';

installWorkerRenderer(self as unknown as WorkerScopeLike);
