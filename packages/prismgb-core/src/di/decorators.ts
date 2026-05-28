/**
 * Dependency Injection Decorators
 */

export interface ServiceOptions {
  token?: string;
  lifecycle?: 'singleton' | 'transient';
  disposal?: 'dispose' | 'cleanup' | 'none';
  dependencies?: string[];
}

/**
 * Build-time marker annotating a class for DI registration. The options are
 * read from the TypeScript AST by `scripts/generate-di.js`; this decorator has
 * no runtime effect and returns the class unchanged.
 *
 * Usage:
 * @Service({ token: 'customToken', lifecycle: 'singleton', disposal: 'dispose' })
 * export class MyService {}
 */
export function Service(_options?: ServiceOptions): ClassDecorator {
  return (target) => target;
}
