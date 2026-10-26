import { z } from 'zod';

export const rendererShutdownResultSchema = z.object({
  requestId: z.string().min(1),
  error: z.string().min(1).optional()
}).strict();

export type RendererShutdownResult = z.output<typeof rendererShutdownResultSchema>;
