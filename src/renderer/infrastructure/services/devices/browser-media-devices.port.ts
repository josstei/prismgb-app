import { TIMING } from '@platform/config';
import { debounce } from '@platform/core';
import type { LoggerLike } from '@platform/core';

export interface MediaDevicesPort {
  enumerateDevices(): Promise<MediaDeviceInfo[]>;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  subscribeDeviceChange(onChange: () => void): () => void;
}

type MediaDevicesEventSource = {
  addEventListener(event: 'devicechange', handler: () => void): void;
  removeEventListener(event: 'devicechange', handler: () => void): void;
};

type BrowserMediaServiceLike = MediaDevicesEventSource & {
  enumerateDevices(): Promise<MediaDeviceInfo[]>;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
};

export class BrowserMediaDevicesPort implements MediaDevicesPort {
  private readonly browserMediaService: BrowserMediaServiceLike;
  private readonly debounceMs: number;
  private readonly logger?: LoggerLike;

  constructor(
    browserMediaService: BrowserMediaServiceLike,
    logger?: LoggerLike,
    debounceMs = TIMING.DEVICE_CHANGE_DEBOUNCE_MS
  ) {
    this.browserMediaService = browserMediaService;
    this.logger = logger;
    this.debounceMs = debounceMs;
  }

  enumerateDevices(): Promise<MediaDeviceInfo[]> {
    return this.browserMediaService.enumerateDevices();
  }

  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
    return this.browserMediaService.getUserMedia(constraints);
  }

  subscribeDeviceChange(onChange: () => void): () => void {
    const handler = debounce(onChange, this.debounceMs);

    this.browserMediaService.addEventListener('devicechange', handler);
    this.logger?.debug(`Device change listener registered (debounce: ${this.debounceMs}ms)`);

    return () => {
      handler.cancel();
      this.browserMediaService.removeEventListener('devicechange', handler);
    };
  }
}
