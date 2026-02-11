export type ContainerKey<TMap extends object> = Extract<keyof TMap, string>;

type ContainerClass<T> = new (...args: unknown[]) => T;

export type RegistrableContainer<TMap extends object> = {
  registerClass<TKey extends ContainerKey<TMap>>(
    name: TKey,
    ServiceClass: ContainerClass<TMap[TKey]>,
    deps: string[]
  ): void;

  registerFactory<TKey extends ContainerKey<TMap>, TFactory extends (...args: any[]) => TMap[TKey]>(
    name: TKey,
    factory: TFactory,
    deps: string[]
  ): void;

  // Legacy fallback kept for compatibility while registrations migrate.
  registerSingleton<TKey extends ContainerKey<TMap>>(
    name: TKey,
    classOrFactory: ContainerClass<TMap[TKey]> | ((...args: any[]) => TMap[TKey]),
    deps: string[]
  ): void;

  autoRegister<TKey extends ContainerKey<TMap>, TDependencies extends object = Record<string, unknown>>(
    name: TKey,
    ServiceClass: { readonly dependencies: readonly string[]; new (deps: TDependencies): TMap[TKey] }
  ): void;
};
