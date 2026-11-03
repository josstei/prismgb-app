/** Own a subscription group, including rollback if a later subscription fails to start. */

interface TrpcEventBridgeLogger {
  error?(message: string, ...args: unknown[]): void;
}

interface TrpcSubscriptionHandle {
  unsubscribe(): void;
}

type TrpcSubscriptionStarter = () => TrpcSubscriptionHandle;

function disposeSubscriptions(
  bridgeName: string,
  handles: TrpcSubscriptionHandle[],
  logger?: TrpcEventBridgeLogger
): void {
  const pending = handles.splice(0).reverse();
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
) {
  const handles: TrpcSubscriptionHandle[] = [];

  try {
    for (const start of starters) {
      handles.push(start());
    }
  } catch (error) {
    disposeSubscriptions(bridgeName, handles, logger);
    throw error;
  }

  return {
    dispose() {
      disposeSubscriptions(bridgeName, handles, logger);
    }
  };
}
