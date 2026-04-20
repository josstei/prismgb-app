import { setServiceMetadata, type ServiceRunsScope } from '../metadata/service-metadata';

export interface ServiceOptions {
  runs: ServiceRunsScope;
}

const VALID_RUNS: readonly ServiceRunsScope[] = ['main', 'renderer', 'worker'];

export function Service(options: ServiceOptions): ClassDecorator {
  if (!VALID_RUNS.includes(options.runs)) {
    throw new Error(`@Service: runs must be one of 'main', 'renderer', 'worker'; got '${options.runs}'.`);
  }
  return (target) => {
    setServiceMetadata(target, { runs: options.runs });
  };
}
