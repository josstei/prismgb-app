export type RegistrableContainer = {
  registerSingleton(
    name: string,
    factory: (...args: unknown[]) => unknown,
    deps: string[]
  ): void;
};
