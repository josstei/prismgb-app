export interface Factory<T, TArgs extends unknown[] = []> {
  create(...args: TArgs): T;
}
