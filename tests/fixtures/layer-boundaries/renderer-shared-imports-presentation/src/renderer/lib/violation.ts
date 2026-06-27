import { applyBodyClass } from '../presentation/effects/body-class';

export function leak(value) {
  return applyBodyClass(value);
}
