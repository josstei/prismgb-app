export class RecoverableBackendInitializationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RecoverableBackendInitializationError';
  }
}
