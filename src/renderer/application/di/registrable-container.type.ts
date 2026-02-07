export type ContainerKey<TMap extends object> = Extract<keyof TMap, string>;

export type RegistrableContainer<TMap extends object> = {
  registerSingleton<TKey extends ContainerKey<TMap>>(
    name: TKey,
    factory: (...args: any[]) => TMap[TKey],
    deps: string[]
  ): void;
};
