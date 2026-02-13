export interface IEventBridge {
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}
