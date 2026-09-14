/**
 * Single containment point for the @inversifyjs/core metadata dependency.
 *
 * inversify does not re-export its metadata reader, so the harness reads
 * constructor token lists through this shim. The metadata is written by the
 * @inversifyjs/core that inversify itself depends on, so the devDependency must
 * resolve to that same single installed copy (enforced by
 * tests/unit/scripts/dependency-singletons.test.ts). Any upgrade churn lands
 * here and nowhere else.
 */

export { getClassMetadata } from '@inversifyjs/core';
export type { ClassMetadata, ClassElementMetadata } from '@inversifyjs/core';
