import { setServiceMetadata, type ServiceRunsScope } from '../metadata/service-metadata';

/**
 * Configuration options for the `@Service` decorator.
 */
export interface ServiceOptions {
  /**
   * The Electron process in which this service is instantiated.
   *
   * Must be one of `'main'`, `'renderer'`, or `'worker'`.
   */
  runs: ServiceRunsScope;
}

const VALID_RUNS: readonly ServiceRunsScope[] = ['main', 'renderer', 'worker'];

/**
 * Declares the Electron process scope in which a service class runs.
 *
 * Attaches `ServiceMetadata` to the class constructor so the runtime can
 * validate that services are only resolved inside the declared process.
 *
 * @param options - Decorator configuration including the target process scope.
 * @returns A class decorator that stores the process scope on the target.
 * @throws {Error} When `options.runs` is not `'main'`, `'renderer'`, or `'worker'`.
 *
 * @example
 * ```ts
 * @Injectable()
 * @Service({ runs: 'main' })
 * class DeviceBridgeService {
 *   constructor(private readonly logger: Logger) {}
 * }
 * ```
 */
export function Service(options: ServiceOptions): ClassDecorator {
  if (!VALID_RUNS.includes(options.runs)) {
    throw new Error(`@Service: runs must be one of 'main', 'renderer', 'worker'; got '${options.runs}'.`);
  }
  return (target) => {
    setServiceMetadata(target, { runs: options.runs });
  };
}
