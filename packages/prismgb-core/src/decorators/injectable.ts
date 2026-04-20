import { injectable } from 'tsyringe';

export function Injectable(): ClassDecorator {
  return injectable() as ClassDecorator;
}
