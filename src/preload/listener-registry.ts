const MAX_LISTENERS_PER_CHANNEL = 10;

type PreloadListener = (...args: unknown[]) => void;
type ListenerRegistry = Map<string, Set<PreloadListener>>;

function createListenerRegistry(): ListenerRegistry {
  return new Map();
}

export {
  MAX_LISTENERS_PER_CHANNEL,
  createListenerRegistry
};
