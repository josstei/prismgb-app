import { singleton } from 'tsyringe';

export function Singleton(): ClassDecorator {
  return singleton() as ClassDecorator;
}
