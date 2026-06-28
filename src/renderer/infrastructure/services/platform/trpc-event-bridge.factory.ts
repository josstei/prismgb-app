/**
 * Groups a set of tRPC push subscriptions into a single disposable. Each starter opens one
 * `trpcClient.<namespace>.<subscription>.subscribe(...)` and returns its handle; {@link
 * TrpcEventBridge.dispose} tears them all down in reverse order, isolating errors so one failing
 * unsubscribe cannot strand the rest. This replaces the retired manifest-driven preload bridge —
 * renderer services now consume typed tRPC subscriptions directly and republish through
 * `@prismgb/events`, supplying their own ordered set of starters.
 */

interface TrpcEventBridgeLogger {
  warn?(message: string, ...args: unknown[]): void;
  error?(message: string, ...args: unknown[]): void;
}

interface TrpcSubscriptionHandle {
  unsubscribe(): void;
}

type TrpcSubscriptionStarter = () => TrpcSubscriptionHandle;

export interface TrpcEventBridge {
  readonly size: number;
  dispose(): void;
}

function disposeSubscriptions(
  bridgeName: string,
  handles: TrpcSubscriptionHandle[],
  logger?: TrpcEventBridgeLogger
): void {
  const pending = [...handles].reverse();
  handles.length = 0;
  for (const handle of pending) {
    try {
      handle.unsubscribe();
    } catch (error) {
      logger?.error?.(`${bridgeName}: failed to unsubscribe tRPC event`, error);
    }
  }
}

export function createTrpcEventBridge(
  bridgeName: string,
  starters: readonly TrpcSubscriptionStarter[],
  logger?: TrpcEventBridgeLogger
): TrpcEventBridge {
  const handles: TrpcSubscriptionHandle[] = [];
  let disposed = false;

  try {
    for (const start of starters) {
      handles.push(start());
    }
  } catch (error) {
    disposeSubscriptions(bridgeName, handles, logger);
    throw error;
  }

  return {
    get size() {
      return handles.length;
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      disposeSubscriptions(bridgeName, handles, logger);
    }
  };
}
