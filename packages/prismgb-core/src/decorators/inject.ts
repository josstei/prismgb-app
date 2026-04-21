import { inject } from 'tsyringe';

export function Inject(token: string | symbol): ParameterDecorator {
  return inject(token) as ParameterDecorator;
}
