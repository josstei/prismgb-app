export class Factory<T, TArgs extends unknown[] = []> {
  #generator: (...args: TArgs) => T;

  constructor(generator: (...args: TArgs) => T) {
    this.#generator = generator;
  }

  create(...args: TArgs): T {
    return this.#generator(...args);
  }
}
