export type RegistryFactory<TValue, TArgs extends unknown[]> = (...args: TArgs) => TValue;

export interface RegistryEntry<TValue, TMetadata, TArgs extends unknown[]> {
  id: string;
  factory: RegistryFactory<TValue, TArgs>;
  metadata: TMetadata;
}

export class TypedRegistryFactory<TValue, TMetadata = Record<string, unknown>, TArgs extends unknown[] = []> {
  private readonly factories = new Map<string, RegistryFactory<TValue, TArgs>>();
  private readonly metadata = new Map<string, TMetadata>();

  register(id: string, factory: RegistryFactory<TValue, TArgs>, metadata: TMetadata): void {
    if (!id) {
      throw new Error('Registry entry id is required');
    }

    this.factories.set(id, factory);
    this.metadata.set(id, metadata);
  }

  registerMany(entries: readonly RegistryEntry<TValue, TMetadata, TArgs>[]): void {
    for (const entry of entries) {
      this.register(entry.id, entry.factory, entry.metadata);
    }
  }

  create(id: string, ...args: TArgs): TValue {
    const factory = this.factories.get(id);
    if (!factory) {
      throw new Error(`No registry entry found for id: ${id}`);
    }

    return factory(...args);
  }

  has(id: string): boolean {
    return this.factories.has(id);
  }

  getMetadata(id: string): TMetadata | undefined {
    return this.metadata.get(id);
  }

  listIds(): string[] {
    return [...this.factories.keys()];
  }

  unregister(id: string): boolean {
    const removedFactory = this.factories.delete(id);
    const removedMetadata = this.metadata.delete(id);
    return removedFactory || removedMetadata;
  }

  clear(): void {
    this.factories.clear();
    this.metadata.clear();
  }
}

