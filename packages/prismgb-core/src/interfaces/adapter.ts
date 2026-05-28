export interface Adapter<TSource, TStream, TSpecs = unknown> {
  connect(source: TSource): Promise<void>;
  disconnect(): Promise<void>;
  getStream(): Promise<TStream>;
  getSpecs(): TSpecs;
}
