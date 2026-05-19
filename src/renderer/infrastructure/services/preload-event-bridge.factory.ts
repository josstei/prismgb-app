type MaybeUnsubscribe = (() => void) | null | undefined;

interface PreloadEventBridgeLogger {
  warn?(message: string, ...args: unknown[]): void;
  error?(message: string, ...args: unknown[]): void;
}

interface PreloadEventSubscriptionDescriptor<TApi> {
  id: string;
  subscribe(api: TApi): MaybeUnsubscribe;
}

interface PreloadEventBridgeOptions<TApi> {
  api: TApi;
  bridgeName: string;
  subscriptions: readonly PreloadEventSubscriptionDescriptor<TApi>[];
  logger?: PreloadEventBridgeLogger;
}

export interface PreloadEventBridge {
  readonly size: number;
  dispose(): void;
}

export function createPreloadEventBridge<TApi>({
  api,
  bridgeName,
  subscriptions,
  logger
}: PreloadEventBridgeOptions<TApi>): PreloadEventBridge {
  const unsubscribers: Array<() => void> = [];
  let disposed = false;

  for (const subscription of subscriptions) {
    const unsubscribe = subscription.subscribe(api);
    if (typeof unsubscribe !== 'function') {
      logger?.warn?.(`${bridgeName}: subscription "${subscription.id}" did not return an unsubscribe function`);
      continue;
    }
    unsubscribers.push(unsubscribe);
  }

  return {
    get size() {
      return unsubscribers.length;
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;

      const cleanup = [...unsubscribers].reverse();
      unsubscribers.length = 0;

      for (const unsubscribe of cleanup) {
        try {
          unsubscribe();
        } catch (error) {
          logger?.error?.(`${bridgeName}: failed to unsubscribe preload event`, error);
        }
      }
    }
  };
}
