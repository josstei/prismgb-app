export type PipelineState =
  | 'uninitialized'
  | 'ready'
  | 'suspended'
  | 'error'
  | 'disposed';
