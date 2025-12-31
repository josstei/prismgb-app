import { EventEmitter } from 'events';

class EventBus {
  constructor({ loggerFactory } = {}) {
    this._emitter = new EventEmitter();
    this.logger = loggerFactory?.create('EventBus');
  }

  publish(event, data) {
    try {
      this._emitter.emit(event, data);
    } catch (error) {
      this.logger?.error(`Error in event handler for "${event}":`, error);
    }
  }

  subscribe(event, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('Handler must be a function');
    }
    this._emitter.on(event, handler);
    return () => this._emitter.off(event, handler);
  }

  unsubscribe(event, handler) {
    this._emitter.off(event, handler);
  }
}

export { EventBus };
