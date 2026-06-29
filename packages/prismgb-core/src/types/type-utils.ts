/**
 * Domain-agnostic type-level utilities shared across the workspace.
 */

/** The union of an object/record type's value types (`T[keyof T]`). */
export type ValueOf<T> = T[keyof T];

/** Collapses a union into the intersection of its members. */
export type UnionToIntersection<TUnion> =
  (TUnion extends unknown ? (value: TUnion) => void : never) extends (value: infer TIntersection) => void
    ? TIntersection
    : never;

/** Recursively extracts the string leaf values of a nested record type. */
export type LeafValues<T> = T extends string
  ? T
  : T extends Record<string, unknown>
    ? LeafValues<T[keyof T]>
    : never;

/** Compile-time exhaustiveness assertion — instantiate with the leftover union. */
export type AssertNever<T extends never> = T;
