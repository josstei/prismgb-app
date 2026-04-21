/**
 * Well-known `Reflect.metadata` keys used by all PrismGB core decorators.
 *
 * Each key is a unique `Symbol` so that decorator metadata stored on the
 * same class constructor cannot collide across packages.
 */
export const METADATA_KEYS = {
  SERVICE: Symbol('prismgb:service'),
  MODULE: Symbol('prismgb:module'),
  RPC_METHODS: Symbol('prismgb:rpc-methods'),
  WORKER_METHODS: Symbol('prismgb:worker-methods'),
  SUBSCRIBE_HANDLERS: Symbol('prismgb:subscribe-handlers'),
  PUSH_PROPERTIES: Symbol('prismgb:push-properties'),
  ON_INIT: Symbol('prismgb:on-init'),
  ON_DESTROY: Symbol('prismgb:on-destroy')
} as const;

/**
 * Union of all `Symbol` values in `METADATA_KEYS`.
 */
export type MetadataKey = typeof METADATA_KEYS[keyof typeof METADATA_KEYS];
