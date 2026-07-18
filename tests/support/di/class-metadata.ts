/**
 * Single containment point for the @inversifyjs/core metadata dependency.
 *
 * inversify does not re-export its metadata reader, so the harness reads
 * constructor token lists through this shim. The @inversifyjs/core version is
 * coupled to the installed inversify major (inversify 8.x -> core 11.x); any
 * upgrade churn lands here and nowhere else.
 */

export { getClassMetadata } from '@inversifyjs/core';
export type { ClassMetadata, ClassElementMetadata } from '@inversifyjs/core';
