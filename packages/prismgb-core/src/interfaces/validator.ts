export interface Validator<T> {
  validate(input: unknown): { success: boolean; data?: T; error?: Error };
}
