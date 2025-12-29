/**
 * Streaming Service
 *
 * Manages media streaming with device-specific adapters
 * 100% UI-agnostic - only manages MediaStream state and emits events
 *
 * Uses a state machine to prevent race conditions in start/stop operations.
 *
 * Events emitted:
 * - 'stream:started' - Stream successfully started
 * - 'stream:stopped' - Stream stopped
 * - 'stream:error' - Stream error occurred
 */

import { BaseService } from '@shared/base/service.js';
import { DeviceDetectionHelper } from '@shared/features/devices/device-detection.js';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.js';

/**
 * Stream lifecycle states for the state machine
 * @readonly
 * @enum {string}
 */
const StreamState = {
  IDLE: 'idle',
  STARTING: 'starting',
  STREAMING: 'streaming',
  STOPPING: 'stopping',
  ERROR: 'error'
};

export class StreamingService extends BaseService {
  /**
   * @param {Object} dependencies - Injected dependencies
   * @param {DeviceService} dependencies.deviceService - Device enumeration service
   * @param {EventBus} dependencies.eventBus - Event publisher
   * @param {Function} dependencies.loggerFactory - Logger factory
   * @param {AdapterFactory} dependencies.adapterFactory - Creates device adapters
   * @param {Object} dependencies.ipcClient - IPC client for main process communication
   */
  constructor(dependencies) {
    super(dependencies, ['deviceService', 'eventBus', 'loggerFactory', 'adapterFactory', 'ipcClient'], 'StreamingService');

    // State machine
    this._state = StreamState.IDLE;
    this._operationPromise = null;

    // Stream state
    this.currentStream = null;
    this.currentAdapter = null;
    this.currentDevice = null;
    this.currentCapabilities = null;

    // Track event handlers for cleanup
    this._trackEndedHandler = null;
  }

  /**
   * Check if currently streaming
   * @returns {boolean} True if in STREAMING state
   */
  get isStreaming() {
    return this._state === StreamState.STREAMING;
  }

  /**
   * Start streaming from a device
   * Handles state machine transitions: IDLE/ERROR -> STARTING -> STREAMING
   * @param {string|null} [deviceId=null] - Device ID to stream from, auto-selects if null
   * @returns {Promise<Object>} Result with stream, device, settings, and capabilities
   * @throws {Error} If cannot start from current state or device unavailable
   */
  async start(deviceId = null) {
    // If already starting, return the existing operation
    if (this._state === StreamState.STARTING && this._operationPromise) {
      this.logger.debug('Start already in progress, reusing promise');
      return this._operationPromise;
    }

    // If stopping, wait for it to complete first
    if (this._state === StreamState.STOPPING && this._operationPromise) {
      this.logger.debug('Waiting for stop to complete before starting');
      await this._operationPromise;
    }

    // If already streaming, stop first
    if (this._state === StreamState.STREAMING) {
      await this.stop();
    }

    // Check if we can transition to starting
    if (this._state !== StreamState.IDLE && this._state !== StreamState.ERROR) {
      throw new Error(`Cannot start from state: ${this._state}`);
    }

    // Clean up any partial state from previous ERROR before starting
    if (this._state === StreamState.ERROR) {
      this._cleanupPartialState();
    }

    this._state = StreamState.STARTING;
    this._operationPromise = this._performStart(deviceId);

    try {
      const result = await this._operationPromise;
      this._state = StreamState.STREAMING;
      return result;
    } catch (error) {
      this._state = StreamState.ERROR;
      throw error;
    } finally {
      this._operationPromise = null;
    }
  }

  /**
   * Perform actual stream start
   * @private
   */
  async _performStart(deviceId) {
    try {
      // Get device
      let device;
      if (deviceId) {
        device = await this._getDeviceById(deviceId);
      } else {
        device = await this._autoSelectDevice();
      }

      if (!device) {
        throw new Error('No device available for streaming');
      }

      // Get adapter for device (pass ipcClient for device adapter)
      this.currentAdapter = this.adapterFactory.getAdapterForDevice(device, {
        ipcClient: this.ipcClient
      });

      // Get stream from adapter
      this.currentStream = await this.currentAdapter.getStream(device);
      this.currentDevice = device;
      this.deviceService.cacheSupportedDevice(device);

      // Get stream settings
      const settings = this._getStreamSettings();

      // Get and store capabilities
      const capabilities = await this.currentAdapter.getCapabilities(device);
      this.currentCapabilities = capabilities;

      // Monitor video track for device disconnection/power-off
      this._setupTrackMonitoring();

      this.logger.info('Stream started successfully');

      // Emit event
      this.eventBus.publish(EventChannels.STREAM.STARTED, {
        stream: this.currentStream,
        device: this.currentDevice,
        settings,
        capabilities
      });

      return { stream: this.currentStream, device: this.currentDevice, settings, capabilities };
    } catch (error) {
      this.logger.error('Failed to start stream:', error);
      this.eventBus.publish(EventChannels.STREAM.ERROR, {
        error,
        operation: 'start',
        deviceId: deviceId || 'auto-select',
        message: error.message || 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Stop streaming and release resources
   * Handles state machine transitions: STREAMING/STARTING -> STOPPING -> IDLE
   * @returns {Promise<void>}
   */
  async stop() {
    // If already stopping, return the existing operation
    if (this._state === StreamState.STOPPING && this._operationPromise) {
      this.logger.debug('Stop already in progress, reusing promise');
      return this._operationPromise;
    }

    // If starting, wait for it to complete first, then stop
    if (this._state === StreamState.STARTING && this._operationPromise) {
      this.logger.debug('Waiting for start to complete before stopping');
      try {
        await this._operationPromise;
      } catch (error) {
        this.logger.warn('Start operation failed during stop, continuing with cleanup:', error.message);
      }
    }

    // Nothing to stop if idle or already in error
    if (this._state === StreamState.IDLE) {
      this.logger.debug('Not streaming, nothing to stop');
      return;
    }

    this._state = StreamState.STOPPING;
    this._operationPromise = this._performStop();

    try {
      await this._operationPromise;
      this._state = StreamState.IDLE;
    } catch (error) {
      // Even on error, move to idle (cleanup happened)
      this._state = StreamState.IDLE;
      throw error;
    } finally {
      this._operationPromise = null;
    }
  }

  /**
   * Perform actual stream stop
   * @private
   */
  async _performStop() {
    this.logger.info('Stopping stream');

    // Remove track monitoring before releasing stream
    this._removeTrackMonitoring();

    // Release stream via adapter (with error handling to ensure cleanup)
    if (this.currentAdapter && this.currentStream) {
      try {
        await this.currentAdapter.releaseStream(this.currentStream);
      } catch (error) {
        this.logger.error('Error releasing stream:', error);
        // Continue with cleanup even if release fails
      }
    }

    // Clear state (always, even if release failed)
    this.currentStream = null;
    this.currentAdapter = null;
    this.currentDevice = null;
    this.currentCapabilities = null;

    // Emit event
    this.eventBus.publish(EventChannels.STREAM.STOPPED);

    this.logger.info('Stream stopped');
  }

  /**
   * Set up monitoring for video track ended event
   * Detects when device is powered off or disconnected
   * @private
   */
  _setupTrackMonitoring() {
    if (!this.currentStream) return;

    const videoTrack = this.currentStream.getVideoTracks()[0];
    if (!videoTrack) return;

    // Create handler that stops the stream when track ends
    this._trackEndedHandler = () => {
      this.logger.warn('Video track ended - device may have been disconnected or powered off');

      // Emit error event to notify UI
      this.eventBus.publish(EventChannels.STREAM.ERROR, {
        error: new Error('Video track ended unexpectedly'),
        operation: 'streaming',
        message: 'Device disconnected or powered off'
      });

      // Stop the stream (will clean up and emit STOPPED event)
      this.stop().catch(error => {
        this.logger.error('Error during track-ended cleanup:', error);
      });
    };

    videoTrack.addEventListener('ended', this._trackEndedHandler);
    this.logger.debug('Track monitoring set up for video track');
  }

  /**
   * Remove track monitoring event listeners
   * @private
   */
  _removeTrackMonitoring() {
    if (!this.currentStream || !this._trackEndedHandler) return;

    const videoTrack = this.currentStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.removeEventListener('ended', this._trackEndedHandler);
    }

    this._trackEndedHandler = null;
    this.logger.debug('Track monitoring removed');
  }

  /**
   * Clean up partial state from failed start attempts
   * Called when transitioning from ERROR state to allow clean restart
   * @private
   */
  _cleanupPartialState() {
    this.logger.debug('Cleaning up partial state from ERROR');

    // Remove any track monitoring that might have been set up
    this._removeTrackMonitoring();

    // Release stream if it was acquired
    if (this.currentAdapter && this.currentStream) {
      this.currentAdapter.releaseStream(this.currentStream).catch(error => {
        this.logger.warn('Error releasing stream during partial cleanup:', error);
      });
    }

    // Clear all state
    this.currentStream = null;
    this.currentAdapter = null;
    this.currentDevice = null;
    this.currentCapabilities = null;
  }

  /**
   * Get current media stream
   * @returns {MediaStream|null} Current stream or null if not streaming
   */
  getStream() {
    return this.currentStream;
  }

  /**
   * Check if streaming is active (alias for isStreaming)
   * @returns {boolean} True if streaming
   */
  isActive() {
    return this.isStreaming;
  }

  /**
   * Get device by ID
   * @param {string} deviceId - Device ID
   * @returns {Promise<MediaDeviceInfo>} Device info
   * @private
   */
  async _getDeviceById(deviceId) {
    // Use DeviceService to ensure permission warm-up and caching
    const { devices } = await this.deviceService.enumerateDevices();
    const device = devices.find(d => d.deviceId === deviceId && d.kind === 'videoinput');

    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    return device;
  }

  /**
   * Auto-select device by VID/PID
   * @returns {Promise<MediaDeviceInfo>} Selected device
   * @throws {Error} If no supported device found
   * @private
   */
  async _autoSelectDevice() {
    this.logger.info('Auto-selecting device');

    const storedIds = this.deviceService.getRegisteredStoredDeviceIds();
    for (const deviceId of storedIds) {
      try {
        const device = await this._getDeviceById(deviceId);
        this.logger.info('Using stored device ID:', device.label);
        return device;
      } catch {
        this.logger.warn('Stored device ID not found in enumeration');
      }
    }

    const { devices } = await this.deviceService.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    const matchedDevice = videoDevices.find(device =>
      DeviceDetectionHelper.matchesByLabel(device.label) !== null
    );

    if (matchedDevice) {
      this.logger.info('Auto-selected device by label:', matchedDevice.label);
      return matchedDevice;
    }

    const labelsHidden = videoDevices.length > 0 && videoDevices.every(device => !device.label);
    if (labelsHidden) {
      throw new Error('Chromatic camera not authorized. Please grant permission and retry.');
    }

    throw new Error('No supported device found');
  }

  /**
   * Get stream settings
   * @returns {Object|null} Stream settings
   * @private
   */
  _getStreamSettings() {
    if (!this.currentStream) {
      return null;
    }

    const videoTrack = this.currentStream.getVideoTracks()[0];
    const audioTracks = this.currentStream.getAudioTracks();

    return {
      video: videoTrack ? videoTrack.getSettings() : null,
      audio: audioTracks.length > 0 ? audioTracks[0].getSettings() : null,
      hasAudio: audioTracks.length > 0
    };
  }
}
