/**
 * DeviceProfile - Base class for device profile definitions
 *
 * Defines the interface and validation for device profiles.
 * All device-specific profiles should extend this class.
 */

type LoggerLike = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
};

interface Resolution {
  label: string;
  width: number;
  height: number;
  scale: number | null;
}

interface NativeResolution {
  width: number;
  height: number;
}

export interface DeviceUSBIdentifier {
  vendorId: number;
  productId: number;
  deviceClass?: number;
  [key: string]: unknown;
}

interface DisplayConfigInput {
  nativeResolution: NativeResolution;
  supportedResolutions?: ReadonlyArray<Resolution>;
  aspectRatio?: number;
  pixelPerfect?: boolean;
}

interface MediaConfigInput {
  video?: Record<string, unknown>;
  audio?: {
    full?: Record<string, unknown>;
    simple?: Record<string, unknown>;
  };
  fallbackStrategy?: string;
}

interface RenderingConfigInput {
  canvasScale?: number;
  imageSmoothing?: boolean;
  preferredRenderer?: string;
}

interface BehaviorConfigInput {
  autoLaunchDelay?: number;
  requiresStrictMode?: boolean;
  allowFallback?: boolean;
}

interface MetadataConfigInput {
  description?: string;
  website?: string;
  supportContact?: string;
  documentation?: string;
}

export interface DeviceProfileConfig {
  id: string;
  name: string;
  manufacturer: string;
  version?: string;
  usbIdentifiers?: DeviceUSBIdentifier[];
  display: DisplayConfigInput;
  media?: MediaConfigInput;
  capabilities?: Iterable<string>;
  rendering?: RenderingConfigInput;
  behavior?: BehaviorConfigInput;
  metadata?: MetadataConfigInput;
}

interface DeviceProfileDisplay {
  nativeResolution: NativeResolution;
  supportedResolutions: ReadonlyArray<Resolution>;
  aspectRatio: number;
  pixelPerfect: boolean;
}

interface DeviceProfileMedia {
  video: Record<string, unknown>;
  audio: {
    full: Record<string, unknown>;
    simple: Record<string, unknown>;
  };
  fallbackStrategy: string;
}

interface DeviceProfileRendering {
  canvasScale: number;
  imageSmoothing: boolean;
  preferredRenderer: string;
}

interface DeviceProfileBehavior {
  autoLaunchDelay: number;
  requiresStrictMode: boolean;
  allowFallback: boolean;
}

interface DeviceProfileMetadata {
  description: string;
  website?: string;
  supportContact?: string;
  documentation?: string;
}

/**
 * No-op logger for when no logger is provided
 * Silent by default to maintain logging consistency across shared modules
 */
const NO_OP_LOGGER: LoggerLike = Object.freeze({
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {}
});

class DeviceProfile {
  logger: LoggerLike;
  id: string;
  name: string;
  manufacturer: string;
  version: string;
  usbIdentifiers: DeviceUSBIdentifier[];
  display: DeviceProfileDisplay;
  media: DeviceProfileMedia;
  capabilities: Set<string>;
  rendering: DeviceProfileRendering;
  behavior: DeviceProfileBehavior;
  metadata: DeviceProfileMetadata;

  /**
   * Create a new device profile
   * @param {Object} config - Profile configuration
   * @param {Object} logger - Optional logger instance
   */
  constructor(config: DeviceProfileConfig, logger: LoggerLike | null = null) {
    // Use provided logger or no-op (no console fallback in shared modules)
    this.logger = logger || NO_OP_LOGGER;

    // Validate configuration
    this._validateConfig(config);

    // Identity
    this.id = config.id;
    this.name = config.name;
    this.manufacturer = config.manufacturer;
    this.version = config.version || '1.0.0';

    // USB Detection
    this.usbIdentifiers = config.usbIdentifiers || [];

    // Display Capabilities
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

    // Media Constraints
    this.media = {
      video: config.media?.video || this._getDefaultVideoConstraints(),
      audio: {
        full: config.media?.audio?.full || this._getDefaultAudioConstraints(),
        simple: config.media?.audio?.simple || this._getDefaultSimpleAudioConstraints()
      },
      fallbackStrategy: config.media?.fallbackStrategy || 'audio-simple'
    };

    // Device Capabilities
    this.capabilities = new Set(config.capabilities || [
      'video-capture',
      'screenshot'
    ]);

    // Rendering Configuration
    this.rendering = {
      canvasScale: config.rendering?.canvasScale || 4,
      imageSmoothing: config.rendering?.imageSmoothing !== true, // Default: disabled for pixel-perfect
      preferredRenderer: config.rendering?.preferredRenderer || 'canvas'
    };

    // Behavior
    this.behavior = {
      autoLaunchDelay: config.behavior?.autoLaunchDelay || 500,
      requiresStrictMode: config.behavior?.requiresStrictMode !== false,
      allowFallback: config.behavior?.allowFallback !== true
    };

    // Metadata
    this.metadata = {
      description: config.metadata?.description || '',
      website: config.metadata?.website,
      supportContact: config.metadata?.supportContact,
      documentation: config.metadata?.documentation
    };

    this.logger.info(`Created profile: ${this.name} (${this.id})`);
  }

  /**
   * Validate configuration
   * @private
   */
  _validateConfig(config: DeviceProfileConfig) {
    if (!config) {
      throw new Error('DeviceProfile: Configuration is required');
    }

    // Required fields
    const required: Array<'id' | 'name' | 'manufacturer'> = ['id', 'name', 'manufacturer'];
    for (const field of required) {
      if (!config[field]) {
        throw new Error(`DeviceProfile: Missing required field: ${field}`);
      }
    }

    // Validate display configuration
    if (!config.display || !config.display.nativeResolution) {
      throw new Error('DeviceProfile: Display configuration with nativeResolution is required');
    }

    const { width, height } = config.display.nativeResolution;
    if (!width || !height || width <= 0 || height <= 0) {
      throw new Error('DeviceProfile: Invalid nativeResolution dimensions');
    }

    // Validate USB identifiers if provided
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

    // Validate ID format
    if (!/^[a-z0-9-]+$/.test(config.id)) {
      throw new Error('DeviceProfile: ID must contain only lowercase letters, numbers, and hyphens');
    }
  }

  /**
   * Calculate aspect ratio from resolution
   * @private
   */
  _calculateAspectRatio(resolution: NativeResolution): number {
    return resolution.width / resolution.height;
  }

  /**
   * Get default video constraints
   * @private
   */
  _getDefaultVideoConstraints() {
    const { width, height } = this.display?.nativeResolution || { width: 640, height: 480 };
    return {
      width: { exact: width },
      height: { exact: height },
      frameRate: { ideal: 60, min: 30 },
      latency: { ideal: 0 }
    };
  }

  /**
   * Get default audio constraints
   * @private
   */
  _getDefaultAudioConstraints() {
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

  /**
   * Get default simple audio constraints
   * @private
   */
  _getDefaultSimpleAudioConstraints() {
    return {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    };
  }

  /**
   * Check if profile has a specific capability
   * @param {string} capability - Capability to check
   * @returns {boolean} True if capability is supported
   */
  hasCapability(capability: string): boolean {
    return this.capabilities.has(capability);
  }

  /**
   * Get media constraints for this device
   * @param {string} deviceId - Optional device ID for constraints
   * @returns {Object} Media constraints object
   */
  getMediaConstraints(deviceId: string | null = null): { video: Record<string, unknown>; audio: Record<string, unknown> } {
    const constraints: { video: Record<string, unknown>; audio: Record<string, unknown> } = {
      video: { ...this.media.video },
      audio: { ...this.media.audio.full }
    };

    // Add device ID if provided
    if (deviceId) {
      constraints.video.deviceId = { exact: deviceId };
      constraints.audio.deviceId = deviceId;
    }

    return constraints;
  }

  /**
   * Get resolution by scale factor
   * @param {number} scale - Scale factor
   * @returns {Object} Resolution object with width and height
   */
  getResolutionByScale(scale: number): { width: number; height: number } {
    const native = this.display.nativeResolution;
    return {
      width: native.width * scale,
      height: native.height * scale
    };
  }

  /**
   * Serialize profile to JSON
   * @returns {Object} JSON representation
   */
  toJSON() {
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
