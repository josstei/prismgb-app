export interface FallbackConfig {
  name: string;
  detailLevel: string;
  audio: boolean;
  video: boolean;
  description?: string;
}

export class IFallbackStrategy {
  initialize(_context: unknown): void;
  getNext(): FallbackConfig | null;
  hasMore(): boolean;
  reset(): void;
}
