import { inject } from 'tsyringe';

/**
 * Injects a dependency by token rather than by constructor parameter type.
 *
 * Delegates to tsyringe's `inject` so the container resolves the value
 * registered under `token` rather than the TypeScript-reflected class type.
 * Use when injecting interfaces, primitive values, or tokens shared across
 * process boundaries.
 *
 * @param token - String or symbol token identifying the dependency in the container.
 * @returns A parameter decorator that resolves the token from the DI container.
 *
 * @example
 * ```ts
 * const LOGGER_TOKEN = Symbol('Logger');
 *
 * @Injectable()
 * @Service({ runs: 'main' })
 * class DeviceService {
 *   constructor(@Inject(LOGGER_TOKEN) private readonly logger: Logger) {}
 * }
 * ```
 */
export function Inject(token: string | symbol): ParameterDecorator {
  return inject(token) as ParameterDecorator;
}
