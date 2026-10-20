/**
 * Decoration-time metadata lives in a module-scoped WeakMap keyed by class
 * constructor, so no reflect-metadata dependency is required and worker
 * bundles stay clean.
 */

interface EventHandlerBinding {
  readonly channel: string;
  readonly methodKey: string | symbol;
}

type EventHandlerMethod<TPayload> = (payload: TPayload) => void | Promise<void>;

const eventHandlerBindings = new WeakMap<Function, EventHandlerBinding[]>();

/**
 * Creates a typed @OnEvent method decorator for the given payload map.
 * The decorated method's payload parameter is compile-checked against the
 * payload type registered for the subscribed channel.
 */
export function createOnEventDecorator<TPayloadMap>() {
  return function onEvent<TChannel extends Extract<keyof TPayloadMap, string>>(channel: TChannel) {
    return function registerEventHandler<TMethod extends EventHandlerMethod<TPayloadMap[TChannel]>>(
      target: object,
      methodKey: string | symbol,
      _descriptor: TypedPropertyDescriptor<TMethod>
    ): void {
      const constructor = target.constructor;
      const bindings = eventHandlerBindings.get(constructor);
      if (bindings) {
        bindings.push({ channel, methodKey });
        return;
      }
      eventHandlerBindings.set(constructor, [{ channel, methodKey }]);
    };
  };
}

/** Collects the event-handler bindings declared on a class and its ancestors. */
export function getEventHandlerBindings(constructor: Function): EventHandlerBinding[] {
  const collected: EventHandlerBinding[] = [];
  for (let current: Function | null = constructor; typeof current === 'function'; current = Object.getPrototypeOf(current) as Function | null) {
    collected.push(...(eventHandlerBindings.get(current) ?? []));
  }
  return collected;
}
