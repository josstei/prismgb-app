export interface FallbackConfig {
  name: string;
  detailLevel: string;
  audio: boolean;
  video: boolean;
  description?: string;
}

export class IFallbackStrategy {
  initialize(_context: unknown): void {
    throw new Error('initialize() must be implemented');
  }

  getNext(): FallbackConfig | null {
    throw new Error('getNext() must be implemented');
  }

  hasMore(): boolean {
    throw new Error('hasMore() must be implemented');
  }

  reset(): void {
    throw new Error('reset() must be implemented');
  }
}
