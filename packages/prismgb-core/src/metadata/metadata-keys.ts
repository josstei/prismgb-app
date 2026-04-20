export const METADATA_KEYS = {
  SERVICE: Symbol('prismgb:service'),
  MODULE: Symbol('prismgb:module'),
  RPC_METHODS: Symbol('prismgb:rpc-methods'),
  WORKER_METHODS: Symbol('prismgb:worker-methods'),
  SUBSCRIBE_HANDLERS: Symbol('prismgb:subscribe-handlers'),
  PUSH_PROPERTIES: Symbol('prismgb:push-properties'),
  ON_INIT: Symbol('prismgb:on-init'),
  ON_DESTROY: Symbol('prismgb:on-destroy'),
} as const;
