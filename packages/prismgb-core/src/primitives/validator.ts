export class Validator<T> {
  #validateFn: (input: unknown) => { success: boolean; data?: T; error?: Error };

  constructor(validateFn: (input: unknown) => { success: boolean; data?: T; error?: Error }) {
    this.#validateFn = validateFn;
  }

  validate(input: unknown): { success: boolean; data?: T; error?: Error } {
    return this.#validateFn(input);
  }
}
