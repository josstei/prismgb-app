/**
 * DeviceProfile - Base class for device profile definitions
 *
 * Defines the interface and validation for device profiles.
 * All device-specific profiles should extend this class.
 */

interface DeviceProfileLogger {
  info(message?: unknown, ...args: unknown[]): void;
  warn(message?: unknown, ...args: unknown[]): void;
  error(message?: unknown, ...args: unknown[]): void;
  debug(message?: unknown, ...args: unknown[]): void;
}

export interface DeviceResolution {
  label?: string;
  width: number;
  height: number;
  scale?: number | null;
}

export interface DeviceUsbIdentifier {
  vendorId: number;
  productId: number;
  deviceName?: string;
  [key: string]: unknown;
}

type ConstraintMap = Record<string, unknown>;

export interface DeviceProfileConfig {
  id: string;
  name: string;
  manufacturer: string;
  version?: string;
  usbIdentifiers?: readonly DeviceUsbIdentifier[];
  display: {
    nativeResolution: DeviceResolution;
    supportedResolutions?: readonly DeviceResolution[];
    aspectRatio?: number;
    pixelPerfect?: boolean;
  };
  media?: {
    video?: ConstraintMap;
    audio?: {
      full?: ConstraintMap;
      simple?: ConstraintMap;
    };
    fallbackStrategy?: string;
  };
  capabilities?: readonly string[];
  rendering?: {
    canvasScale?: number;
    imageSmoothing?: boolean;
    preferredRenderer?: string;
  };
  behavior?: {
    autoLaunchDelay?: number;
    requiresStrictMode?: boolean;
    allowFallback?: boolean;
  };
  metadata?: {
    description?: string;
    website?: string;
    supportContact?: string;
    documentation?: string;
  };
}

export interface DeviceProfileDisplay {
  nativeResolution: DeviceResolution;
  supportedResolutions: readonly DeviceResolution[];
  aspectRatio: number;
  pixelPerfect: boolean;
}

export interface DeviceProfileMedia {
  video: ConstraintMap;
  audio: {
    full: ConstraintMap;
    simple: ConstraintMap;
  };
  fallbackStrategy: string;
}

export interface DeviceProfileRendering {
  canvasScale: number;
  imageSmoothing: boolean;
  preferredRenderer: string;
}

export interface DeviceProfileBehavior {
  autoLaunchDelay: number;
  requiresStrictMode: boolean;
  allowFallback: boolean;
}

export interface DeviceProfileMetadata {
  description: string;
  website?: string;
  supportContact?: string;
  documentation?: string;
}

export interface DeviceProfileJson {
  id: string;
  name: string;
  manufacturer: string;
  version: string;
  usbIdentifiers: readonly DeviceUsbIdentifier[];
  display: DeviceProfileDisplay;
  media: DeviceProfileMedia;
  capabilities: string[];
  rendering: DeviceProfileRendering;
  behavior: DeviceProfileBehavior;
  metadata: DeviceProfileMetadata;
}

const NO_OP_LOGGER: DeviceProfileLogger = Object.freeze({
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {}
});

class DeviceProfile {
  declare logger: DeviceProfileLogger;
  declare id: string;
  declare name: string;
  declare manufacturer: string;
  declare version: string;
  declare usbIdentifiers: readonly DeviceUsbIdentifier[];
  declare display: DeviceProfileDisplay;
  declare media: DeviceProfileMedia;
  declare capabilities: Set<string>;
  declare rendering: DeviceProfileRendering;
  declare behavior: DeviceProfileBehavior;
  declare metadata: DeviceProfileMetadata;

  constructor(config: DeviceProfileConfig, logger: DeviceProfileLogger | null = null) {
    this.logger = logger || NO_OP_LOGGER;

    this._validateConfig(config);

    this.id = config.id;
    this.name = config.name;
    this.manufacturer = config.manufacturer;
    this.version = config.version || '1.0.0';

    this.usbIdentifiers = config.usbIdentifiers || [];

    this.display = {
      nativeResolution: config.display.nativeResolution,
      supportedResolutions: config.display.supportedResolutions || [
        {
          label: `${config.display.nativeResolution.width}x${config.display.nativeResolution.height} (Native)`,
          width: config.display.nativeResolution.width,
          height: config.display.nativeResolution.height,
          scale: 1
        }
      ],
      aspectRatio: config.display.aspectRatio ||
        this._calculateAspectRatio(config.display.nativeResolution),
      pixelPerfect: config.display.pixelPerfect !== false
    };

    this.media = {
      video: config.media?.video || this._getDefaultVideoConstraints(),
      audio: {
        full: config.media?.audio?.full || this._getDefaultAudioConstraints(),
        simple: config.media?.audio?.simple || this._getDefaultSimpleAudioConstraints()
      },
      fallbackStrategy: config.media?.fallbackStrategy || 'audio-simple'
    };

    this.capabilities = new Set(config.capabilities || [
      'video-capture',
      'screenshot'
    ]);

    this.rendering = {
      canvasScale: config.rendering?.canvasScale || 4,
      imageSmoothing: config.rendering?.imageSmoothing !== true,
      preferredRenderer: config.rendering?.preferredRenderer || 'canvas'
    };

    this.behavior = {
      autoLaunchDelay: config.behavior?.autoLaunchDelay || 500,
      requiresStrictMode: config.behavior?.requiresStrictMode !== false,
      allowFallback: config.behavior?.allowFallback !== true
    };

    this.metadata = {
      description: config.metadata?.description || '',
      website: config.metadata?.website,
      supportContact: config.metadata?.supportContact,
      documentation: config.metadata?.documentation
    };

    this.logger.info(`Created profile: ${this.name} (${this.id})`);
  }

  _validateConfig(config: DeviceProfileConfig | null | undefined): asserts config is DeviceProfileConfig {
    if (!config) {
      throw new Error('DeviceProfile: Configuration is required');
    }

    const required: Array<keyof Pick<DeviceProfileConfig, 'id' | 'name' | 'manufacturer'>> = [
      'id',
      'name',
      'manufacturer'
    ];
    for (const field of required) {
      if (!config[field]) {
        throw new Error(`DeviceProfile: Missing required field: ${field}`);
      }
    }

    if (!config.display || !config.display.nativeResolution) {
      throw new Error('DeviceProfile: Display configuration with nativeResolution is required');
    }

    const { width, height } = config.display.nativeResolution;
    if (!width || !height || width <= 0 || height <= 0) {
      throw new Error('DeviceProfile: Invalid nativeResolution dimensions');
    }

    if (config.usbIdentifiers) {
      if (!Array.isArray(config.usbIdentifiers)) {
        throw new Error('DeviceProfile: usbIdentifiers must be an array');
      }

      for (const identifier of config.usbIdentifiers) {
        if (!identifier.vendorId || !identifier.productId) {
          throw new Error('DeviceProfile: USB identifier must have vendorId and productId');
        }
      }
    }

    if (!/^[a-z0-9-]+$/.test(config.id)) {
      throw new Error('DeviceProfile: ID must contain only lowercase letters, numbers, and hyphens');
    }
  }

  _calculateAspectRatio(resolution: DeviceResolution): number {
    return resolution.width / resolution.height;
  }

  _getDefaultVideoConstraints(): ConstraintMap {
    const { width, height } = this.display?.nativeResolution || { width: 640, height: 480 };
    return {
      width: { exact: width },
      height: { exact: height },
      frameRate: { ideal: 60, min: 30 },
      latency: { ideal: 0 }
    };
  }

  _getDefaultAudioConstraints(): ConstraintMap {
    return {
      echoCancellation: { exact: false },
      noiseSuppression: { exact: false },
      autoGainControl: { exact: false },
      channelCount: { ideal: 2 },
      sampleRate: { ideal: 48000 },
      sampleSize: { ideal: 16 },
      latency: { ideal: 0 }
    };
  }

  _getDefaultSimpleAudioConstraints(): ConstraintMap {
    return {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    };
  }

  hasCapability(capability: string): boolean {
    return this.capabilities.has(capability);
  }

  getMediaConstraints(deviceId: string | null = null): { video: ConstraintMap; audio: ConstraintMap } {
    const constraints = {
      video: { ...this.media.video },
      audio: { ...this.media.audio.full }
    };

    if (deviceId) {
      constraints.video.deviceId = { exact: deviceId };
      constraints.audio.deviceId = deviceId;
    }

    return constraints;
  }

  getResolutionByScale(scale: number): { width: number; height: number } {
    const native = this.display.nativeResolution;
    return {
      width: native.width * scale,
      height: native.height * scale
    };
  }

  toJSON(): DeviceProfileJson {
    return {
      id: this.id,
      name: this.name,
      manufacturer: this.manufacturer,
      version: this.version,
      usbIdentifiers: this.usbIdentifiers,
      display: this.display,
      media: this.media,
      capabilities: Array.from(this.capabilities),
      rendering: this.rendering,
      behavior: this.behavior,
      metadata: this.metadata
    };
  }
}

export { DeviceProfile };
