import { singleton } from 'tsyringe';

/**
 * Registers a class as a singleton within the tsyringe DI container.
 *
 * The container creates one instance on first resolution and returns that
 * same instance for every subsequent request. Combine with `@Injectable`
 * for full constructor injection support.
 *
 * @returns A class decorator that registers the target as a singleton.
 *
 * @example
 * ```ts
 * @Singleton()
 * @Injectable()
 * @Service({ runs: 'renderer' })
 * class StreamingService {
 *   constructor(private readonly logger: Logger) {}
 * }
 * ```
 */
export function Singleton(): ClassDecorator {
  return singleton() as ClassDecorator;
}
