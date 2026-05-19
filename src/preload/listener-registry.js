const MAX_LISTENERS_PER_CHANNEL = 10;

function createListenerRegistry() {
  return new Map();
}

export {
  MAX_LISTENERS_PER_CHANNEL,
  createListenerRegistry
};
