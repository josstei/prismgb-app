export interface FallbackConfig {
  name: string;
  detailLevel: string;
  audio: boolean;
  video: boolean;
  description?: string;
  [key: string]: unknown;
}

export class IFallbackStrategy {
  [key: string]: any;
  initialize(_context: unknown): void;
  getNext(): FallbackConfig | null;
  hasMore(): boolean;
  reset(): void;
}
