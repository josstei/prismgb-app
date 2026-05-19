export type JsonObject = Record<string, unknown>;

export type StringLeaf = {
  path: string[];
  value: string;
};

export function flattenStringLeaves(node: unknown, path: string[] = []): StringLeaf[] {
  if (typeof node === 'string') {
    return [{ path, value: node }];
  }

  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return [];
  }

  return Object.entries(node as JsonObject).flatMap(([key, value]) =>
    flattenStringLeaves(value, [...path, key])
  );
}

export function flattenStringValues(node: unknown): string[] {
  return flattenStringLeaves(node).map((leaf) => leaf.value);
}

export function defineContract<T extends JsonObject>(contract: T): Readonly<T> {
  return Object.freeze(contract);
}

export function requireUniqueValues(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }
    seen.add(value);
  }

  if (duplicates.size > 0) {
    throw new Error(`${label} contains duplicate values: ${[...duplicates].sort().join(', ')}`);
  }
}

export type SchemaKind =
  | 'array-buffer'
  | 'boolean'
  | 'number'
  | 'object'
  | 'string'
  | 'void';

export type SchemaRef = {
  kind: SchemaKind;
  type?: string;
  optional?: boolean;
};

export function schemaRef(kind: SchemaKind, options: Omit<SchemaRef, 'kind'> = {}): SchemaRef {
  return Object.freeze({ kind, ...options });
}

