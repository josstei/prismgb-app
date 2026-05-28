export interface Store<TSchema extends Record<string, any>> {
  get<K extends keyof TSchema>(key: K): Promise<TSchema[K] | null>;
  set<K extends keyof TSchema>(key: K, value: TSchema[K]): Promise<void>;
  delete<K extends keyof TSchema>(key: K): Promise<boolean>;
  clear(): Promise<void>;
}
