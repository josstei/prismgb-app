/**
 * Domain-agnostic type-level utilities shared across the workspace.
 */

export type { ValueOf } from 'type-fest';

/** Recursively extracts the string leaf values of a nested record type. */
export type LeafValues<T> = T extends string
  ? T
  : T extends Record<string, unknown>
    ? LeafValues<T[keyof T]>
    : never;

/** Compile-time exhaustiveness assertion — instantiate with the leftover union. */
export type AssertNever<T extends never> = T;
