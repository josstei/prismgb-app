export class Registry<T> {
  #resources = new Set<T>();
  #releaser: (resource: T) => void | Promise<void>;

  constructor(releaser: (resource: T) => void | Promise<void>) {
    this.#releaser = releaser;
  }

  /**
   * Track a generic resource of type T
   */
  add(resource: T): void {
    this.#resources.add(resource);
  }

  /**
   * Untrack a specific resource of type T
   */
  remove(resource: T): boolean {
    return this.#resources.delete(resource);
  }

  /**
   * Release all tracked resources of type T using the custom releaser
   */
  async release(): Promise<void> {
    const targets = Array.from(this.#resources);
    this.#resources.clear();

    const errors: unknown[] = [];
    await Promise.all(
      targets.map(async (target) => {
        try {
          await this.#releaser(target);
        } catch (err) {
          errors.push(err);
        }
      })
    );

    if (errors.length > 0) {
      throw new AggregateError(errors, 'Resource release failure');
    }
  }

  get size(): number {
    return this.#resources.size;
  }
}
