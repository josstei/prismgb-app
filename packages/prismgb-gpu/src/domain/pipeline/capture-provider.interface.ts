export interface ICaptureProvider {
  armCapture(): void;
  hasPendingCapture(): boolean;
  storeCapture(bitmap: ImageBitmap): void;
  retrieveCapture(): ImageBitmap | null;
  reset(): void;
}
