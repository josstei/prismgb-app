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
 * Service decorator to annotate classes for DI registration.
 *
 * Usage:
 * @Service({ token: 'customToken', lifecycle: 'singleton', disposal: 'dispose' })
 * export class MyService {}
 */
export function Service(options?: ServiceOptions): ClassDecorator {
  return function (target: any) {
    target.serviceMetadata = options || {};
    return target;
  };
}

/**
 * Inject decorator to annotate constructor parameters for specific tokens.
 *
 * Usage:
 * constructor(@Inject('eventBus') eventBus: EventBusLike) {}
 */
export function Inject(token: string): ParameterDecorator {
  return function (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) {
    if (!target.injectMetadata) {
      target.injectMetadata = {};
    }
    target.injectMetadata[parameterIndex] = token;
  };
}
