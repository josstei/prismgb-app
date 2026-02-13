export interface IStorageBackend<TData> {
  load(): TData;
  save(data: Partial<TData>): void;
  get<K extends keyof TData>(key: K): TData[K];
  set<K extends keyof TData>(key: K, value: TData[K]): void;
}
