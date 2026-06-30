import { vi } from 'vitest';
import {
  createChromaticMediaDevices,
  createChromaticMediaStream,
  type MediaDeviceInfoDouble,
  type MediaStreamDouble
} from './media.testkit';

export interface BrowserMediaHarnessOptions {
  target?: typeof globalThis;
  connected?: boolean;
  includeAudio?: boolean;
  devices?: MediaDeviceInfo[];
  streamFactory?: (constraints: MediaStreamConstraints) => MediaStream | Promise<MediaStream>;
}

export interface BrowserMediaHarness {
  mediaDevices: MediaDevices;
  connect(): void;
  disconnect(): void;
  setConnected(connected: boolean): void;
  setDevices(devices: MediaDeviceInfo[]): void;
  setIncludeAudio(includeAudio: boolean): void;
  snapshot(): {
    connected: boolean;
    devices: MediaDeviceInfo[];
    listenerCount: number;
  };
  cleanup(): void;
}

type MutableNavigator = Navigator & {
  mediaDevices: MediaDevices;
};

function createNotFoundError(): Error {
  const error = new Error('Requested device not found');
  error.name = 'NotFoundError';
  return error;
}

function ensureNavigator(target: typeof globalThis): MutableNavigator {
  const existingNavigator = target.navigator as MutableNavigator | undefined;
  if (existingNavigator) {
    return existingNavigator;
  }

  const navigator = {} as MutableNavigator;
  Object.defineProperty(target, 'navigator', {
    configurable: true,
    value: navigator
  });
  return navigator;
}

function dispatchToListener(listener: EventListenerOrEventListenerObject, event: Event): void {
  if (typeof listener === 'function') {
    listener(event);
    return;
  }

  listener.handleEvent(event);
}

export function installBrowserMediaHarness(options: BrowserMediaHarnessOptions = {}): BrowserMediaHarness {
  const target = options.target ?? globalThis;
  const navigator = ensureNavigator(target);
  const originalMediaDevices = navigator.mediaDevices;
  const listeners = new Set<EventListenerOrEventListenerObject>();
  let connected = options.connected ?? false;
  let includeAudio = options.includeAudio ?? true;
  let devices: MediaDeviceInfo[] = options.devices
    ? [...options.devices]
    : createChromaticMediaDevices({ includeAudio });

  const dispatchDeviceChange = () => {
    const event = new Event('devicechange');
    for (const listener of listeners) {
      dispatchToListener(listener, event);
    }
    mediaDevices.dispatchEvent(event);
  };

  const mediaDevices = {
    enumerateDevices: vi.fn(async () => connected ? [...devices] : []),
    getSupportedConstraints: vi.fn(() => ({})),
    getUserMedia: vi.fn(async (constraints: MediaStreamConstraints) => {
      if (!connected) {
        throw createNotFoundError();
      }

      if (options.streamFactory) {
        return options.streamFactory(constraints);
      }

      const wantsAudio = constraints.audio !== false && includeAudio;
      return createChromaticMediaStream({ includeAudio: wantsAudio }) as MediaStreamDouble;
    }),
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'devicechange') {
        listeners.add(listener);
      }
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'devicechange') {
        listeners.delete(listener);
      }
    }),
    dispatchEvent: vi.fn(() => true)
  } as unknown as MediaDevices;

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: mediaDevices
  });

  return {
    mediaDevices,
    connect() {
      connected = true;
      dispatchDeviceChange();
    },
    disconnect() {
      connected = false;
      dispatchDeviceChange();
    },
    setConnected(nextConnected: boolean) {
      connected = nextConnected;
      dispatchDeviceChange();
    },
    setDevices(nextDevices: MediaDeviceInfo[]) {
      devices = [...nextDevices];
      dispatchDeviceChange();
    },
    setIncludeAudio(nextIncludeAudio: boolean) {
      includeAudio = nextIncludeAudio;
      devices = createChromaticMediaDevices({ includeAudio }) as MediaDeviceInfoDouble[];
      dispatchDeviceChange();
    },
    snapshot() {
      return {
        connected,
        devices: [...devices],
        listenerCount: listeners.size
      };
    },
    cleanup() {
      listeners.clear();
      if (originalMediaDevices) {
        Object.defineProperty(navigator, 'mediaDevices', {
          configurable: true,
          value: originalMediaDevices
        });
      } else {
        Reflect.deleteProperty(navigator, 'mediaDevices');
      }
    }
  };
}
