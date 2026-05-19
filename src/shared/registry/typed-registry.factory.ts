export type RegistryFactory<TValue, TArgs extends unknown[]> = (...args: TArgs) => TValue;

export interface RegistryEntry<TValue, TMetadata, TArgs extends unknown[]> {
  id: string;
  factory: RegistryFactory<TValue, TArgs>;
  metadata: TMetadata;
}

export class TypedRegistryFactory<TValue, TMetadata = Record<string, unknown>, TArgs extends unknown[] = []> {
  private readonly factories: Map<string, RegistryFactory<TValue, TArgs>>;
  private readonly metadata: Map<string, TMetadata>;
  private readonly values: Map<string, TValue>;

  constructor(
    factories: Map<string, RegistryFactory<TValue, TArgs>> = new Map(),
    metadata: Map<string, TMetadata> = new Map(),
    values: Map<string, TValue> = new Map()
  ) {
    this.factories = factories;
    this.metadata = metadata;
    this.values = values;
  }

  getFactoryMap(): Map<string, RegistryFactory<TValue, TArgs>> {
    return this.factories;
  }

  getMetadataMap(): Map<string, TMetadata> {
    return this.metadata;
  }

  getValueMap(): Map<string, TValue> {
    return this.values;
  }

  register(id: string, factory: RegistryFactory<TValue, TArgs>, metadata: TMetadata): void {
    if (!id) {
      throw new Error('Registry entry id is required');
    }

    this.factories.set(id, factory);
    this.metadata.set(id, metadata);
    this.values.delete(id);
  }

  registerValue(id: string, value: TValue, metadata: TMetadata): void {
    this.register(id, () => value, metadata);
    this.values.set(id, value);
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
    const removedValue = this.values.delete(id);
    return removedFactory || removedMetadata || removedValue;
  }

  clear(): void {
    this.factories.clear();
    this.metadata.clear();
    this.values.clear();
  }
}
