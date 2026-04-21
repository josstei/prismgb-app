import { injectable } from 'tsyringe';

/**
 * Marks a class as available for dependency injection via tsyringe.
 *
 * Constructor parameters are auto-resolved from the DI container using
 * reflected parameter metadata. Use with `@Service` to also declare the
 * process the class runs in.
 *
 * @returns A class decorator that registers the target as injectable.
 *
 * @example
 * ```ts
 * @Injectable()
 * @Service({ runs: 'main' })
 * class DeviceService {
 *   constructor(private readonly logger: Logger) {}
 * }
 * ```
 */
export function Injectable(): ClassDecorator {
  return injectable() as ClassDecorator;
}
