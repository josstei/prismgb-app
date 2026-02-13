/**
 * Streaming Audio Pipeline Service
 *
 * Owns the complete audio pipeline for streaming:
 * - Routes stream audio through Web Audio API
 * - Gates output until the audio track stabilizes (warmup phase)
 * - Manages volume control and audio context lifecycle
 * - Prevents startup distortion through gradual fade-in
 */

import { LifecycleService } from '@prismgb/core';
import { EventChannels } from '@renderer/common/config/event-channels';

type AudioWarmupResult = {
  ready: boolean;
  reason?: string;
  elapsedMs: number;
};

type AudioEnergyResult = {
  ready: boolean;
  reason?: string;
  rms: number;
  elapsedMs: number;
};

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;
type WarmupTimings = {
  unmuteTimeoutMs: number;
  energyTimeoutMs: number;
  stabilizeDelayMs: number;
  fadeMs: number;
  energyThreshold: number;
};

type EventBusLike = {
  subscribe(channel: string, handler: (payload: unknown) => void): () => void;
};

type SettingsServiceLike = {
  getVolume(): number;
};

type LoggerLike = {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

type StreamingAudioPipelineDependencies = {
  eventBus: EventBusLike;
  settingsService: SettingsServiceLike;
  loggerFactory: { create(name: string): LoggerLike };
};

export class StreamingAudioPipelineService extends LifecycleService {
  static readonly dependencies = ['eventBus', 'loggerFactory', 'settingsService'] as const;

  declare eventBus: EventBusLike;
  declare settingsService: SettingsServiceLike;
  declare logger: LoggerLike;

  _audioContext: AudioContext | null;
  _sourceNode: MediaStreamAudioSourceNode | null;
  _gainNode: GainNode | null;
  _analyserNode: AnalyserNode | null;
  _stream: MediaStream | null;
  _audioTrack: MediaStreamTrack | null;
  _isReady: boolean;
  _warmupToken: number;
  _volume: number;
  _targetGain: number;
  _unmuteTimeout: ReturnType<typeof setTimeout> | null;
  _energyTimer: ReturnType<typeof setTimeout> | null;
  _trackUnmuteHandler: (() => void) | null;
  _startPromise: Promise<boolean> | null;
  _unsubscribeVolume: (() => void) | null;

  constructor(dependencies: StreamingAudioPipelineDependencies) {
    super(dependencies, [...StreamingAudioPipelineService.dependencies], 'StreamingAudioPipelineService');

    this._audioContext = null;
    this._sourceNode = null;
    this._gainNode = null;
    this._analyserNode = null;

    this._stream = null;
    this._audioTrack = null;
    this._isReady = false;
    this._warmupToken = 0;

    this._volume = this.settingsService.getVolume();
    this._targetGain = this._volume / 100;

    this._unmuteTimeout = null;
    this._energyTimer = null;
    this._trackUnmuteHandler = null;
    this._startPromise = null;

    this._unsubscribeVolume = this.eventBus.subscribe(
      EventChannels.SETTINGS.VOLUME_CHANGED,
      (volume) => {
        if (typeof volume === 'number') {
          this._handleVolumeChanged(volume);
        }
      }
    );
  }

  async start(stream: MediaStream | null): Promise<boolean> {
    if (this._startPromise && this._stream === stream) {
      return this._startPromise;
    }

    if (this._stream === stream && this._audioContext && this._audioContext.state !== 'closed') {
      return this._isReady;
    }

    const startPromise = this._startInternal(stream);
    this._startPromise = startPromise;

    try {
      return await startPromise;
    } finally {
      if (this._startPromise === startPromise) {
        this._startPromise = null;
      }
    }
  }

  async _startInternal(stream: MediaStream | null): Promise<boolean> {
    this.stop();

    if (!stream) {
      this.logger.warn('Audio warm-up skipped - no stream provided');
      return false;
    }

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) {
      this.logger.info('Audio warm-up skipped - stream has no audio track');
      return false;
    }

    this._stream = stream;
    this._audioTrack = audioTrack;
    this._isReady = false;
    this._warmupToken += 1;
    const token = this._warmupToken;

    const startTime = performance.now();
    const trackSettings = audioTrack.getSettings?.() || {};
    const trackSampleRate = trackSettings.sampleRate || null;

    this._audioContext = this._createAudioContext(trackSampleRate);
    if (!this._audioContext) {
      this.logger.warn('Audio warm-up failed - AudioContext unavailable');
      return false;
    }

    this._sourceNode = this._audioContext.createMediaStreamSource(stream);
    this._analyserNode = this._audioContext.createAnalyser();
    this._gainNode = this._audioContext.createGain();
    this._gainNode.gain.value = 0;

    this._sourceNode.connect(this._analyserNode);
    this._analyserNode.connect(this._gainNode);
    this._gainNode.connect(this._audioContext.destination);

    if (this._audioContext.state === 'suspended') {
      try {
        await this._audioContext.resume();
      } catch (error) {
        this.logger.warn('AudioContext resume failed:', error);
        this.stop();
        return false;
      }
    }

    const timings = this._getWarmupTimings();
    this.logger.info('Audio warm-up started', {
      trackSampleRate,
      contextSampleRate: this._audioContext.sampleRate,
      timings
    });

    const unmuteResult = await this._waitForTrackUnmute(audioTrack, timings.unmuteTimeoutMs, token);
    if (!unmuteResult.ready) {
      this.logger.warn('Audio track unmute timeout - continuing warm-up fallback');
    }

    const energyResult = await this._waitForAudioEnergy({
      timeoutMs: timings.energyTimeoutMs,
      threshold: timings.energyThreshold,
      token
    });

    await this._sleep(timings.stabilizeDelayMs);

    if (token !== this._warmupToken) {
      return false;
    }

    this._fadeTo(this._targetGain, timings.fadeMs);
    this._isReady = true;

    const elapsedMs = Math.round(performance.now() - startTime);
    this.logger.info('Audio warm-up complete', {
      elapsedMs,
      unmuteMs: unmuteResult.elapsedMs,
      energyMs: energyResult.elapsedMs,
      unmuteReady: unmuteResult.ready,
      energyReady: energyResult.ready,
      energyRms: energyResult.rms
    });

    return true;
  }

  stop() {
    this._warmupToken += 1;
    this._startPromise = null;
    this._isReady = false;

    this._clearTimers();
    this._removeTrackListeners();

    if (this._sourceNode) {
      this._sourceNode.disconnect();
      this._sourceNode = null;
    }
    if (this._analyserNode) {
      this._analyserNode.disconnect();
      this._analyserNode = null;
    }
    if (this._gainNode) {
      this._gainNode.disconnect();
      this._gainNode = null;
    }

    if (this._audioContext) {
      this._audioContext.close().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn('AudioContext close failed:', message);
      });
      this._audioContext = null;
    }

    this._stream = null;
    this._audioTrack = null;
  }

  async onDispose(): Promise<void> {
    this.stop();
    if (this._unsubscribeVolume) {
      this._unsubscribeVolume();
      this._unsubscribeVolume = null;
    }
  }

  isReady(): boolean {
    return this._isReady;
  }

  _handleVolumeChanged(volume: number): void {
    const clamped = Math.max(0, Math.min(100, volume));
    this._volume = clamped;
    this._targetGain = clamped / 100;

    if (this._gainNode && this._audioContext && this._isReady) {
      const now = this._audioContext.currentTime;
      this._gainNode.gain.setTargetAtTime(this._targetGain, now, 0.02);
    }
  }

  _createAudioContext(trackSampleRate: number | null): AudioContext | null {
    const audioWindow = window as Window & { webkitAudioContext?: AudioContextCtor };
    const AudioContextCtor = (window.AudioContext || audioWindow.webkitAudioContext) as AudioContextCtor | undefined;
    if (!AudioContextCtor) {
      return null;
    }

    if (trackSampleRate) {
      try {
        return new AudioContextCtor({ sampleRate: trackSampleRate });
      } catch (error: unknown) {
        this.logger.debug('AudioContext sampleRate override failed, retrying default:', error);
      }
    }

    try {
      return new AudioContextCtor();
    } catch (error: unknown) {
      this.logger.error('AudioContext creation failed:', error);
      return null;
    }
  }

  _waitForTrackUnmute(
    track: MediaStreamTrack | null,
    timeoutMs: number,
    token: number
  ): Promise<AudioWarmupResult> {
    return new Promise<AudioWarmupResult>((resolve) => {
      if (!track) {
        resolve({ ready: false, reason: 'no-track', elapsedMs: 0 });
        return;
      }

      if (track.muted === false) {
        resolve({ ready: true, reason: 'already-unmuted', elapsedMs: 0 });
        return;
      }

      const start = performance.now();
      let settled = false;
      const finish = (result: Omit<AudioWarmupResult, 'elapsedMs'>): void => {
        if (settled) return;
        settled = true;
        clearTimeout(this._unmuteTimeout);
        this._unmuteTimeout = null;
        this._removeTrackListeners();
        resolve({ ...result, elapsedMs: Math.round(performance.now() - start) });
      };

      this._trackUnmuteHandler = () => {
        if (token !== this._warmupToken) return;
        finish({ ready: true, reason: 'unmute-event' });
      };

      track.addEventListener('unmute', this._trackUnmuteHandler, { once: true });

      this._unmuteTimeout = setTimeout(() => {
        if (token !== this._warmupToken) return;
        finish({ ready: false, reason: 'timeout' });
      }, timeoutMs);
    });
  }

  _waitForAudioEnergy({
    timeoutMs,
    threshold,
    token
  }: {
    timeoutMs: number;
    threshold: number;
    token: number;
  }): Promise<AudioEnergyResult> {
    return new Promise<AudioEnergyResult>((resolve) => {
      if (!this._analyserNode) {
        resolve({ ready: false, reason: 'no-analyser', rms: 0, elapsedMs: 0 });
        return;
      }

      const buffer = new Uint8Array(this._analyserNode.fftSize);
      let aboveCount = 0;
      const start = performance.now();

      const sample = (): void => {
        if (!this._analyserNode || token !== this._warmupToken) {
          resolve({ ready: false, reason: 'canceled', rms: 0, elapsedMs: Math.round(performance.now() - start) });
          return;
        }

        this._analyserNode.getByteTimeDomainData(buffer);
        const rms = this._computeRms(buffer);

        if (rms >= threshold) {
          aboveCount += 1;
          if (aboveCount >= 2) {
            resolve({ ready: true, rms, elapsedMs: Math.round(performance.now() - start) });
            return;
          }
        } else {
          aboveCount = 0;
        }

        if (performance.now() - start >= timeoutMs) {
          resolve({ ready: false, reason: 'timeout', rms, elapsedMs: Math.round(performance.now() - start) });
          return;
        }

        this._energyTimer = setTimeout(sample, 50);
      };

      sample();
    });
  }

  _computeRms(buffer: Uint8Array): number {
    if (!buffer || buffer.length === 0) return 0;

    let sum = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      const value = (buffer[i] - 128) / 128;
      sum += value * value;
    }
    return Math.sqrt(sum / buffer.length);
  }

  _fadeTo(targetGain: number, fadeMs: number): void {
    if (!this._gainNode || !this._audioContext) return;

    const now = this._audioContext.currentTime;
    const clamped = Math.max(0, Math.min(1, targetGain));
    this._gainNode.gain.cancelScheduledValues(now);
    this._gainNode.gain.setValueAtTime(this._gainNode.gain.value, now);

    // Use ease-in curve for smooth perceived fade (human hearing is logarithmic)
    const curve = this._createEaseInCurve(this._gainNode.gain.value, clamped, 64);
    this._gainNode.gain.setValueCurveAtTime(curve, now, fadeMs / 1000);
  }

  _createEaseInCurve(startValue: number, endValue: number, steps: number): Float32Array {
    const curve = new Float32Array(steps);
    for (let i = 0; i < steps; i++) {
      // Ease-in cubic: t^3 - slow start, accelerates toward end
      const t = i / (steps - 1);
      const eased = t * t * t;
      curve[i] = startValue + (endValue - startValue) * eased;
    }
    return curve;
  }

  _getWarmupTimings(): WarmupTimings {
    const isLinux = this._isLinux();
    return {
      unmuteTimeoutMs: isLinux ? 1800 : 1200,
      energyTimeoutMs: isLinux ? 1000 : 600,
      stabilizeDelayMs: isLinux ? 300 : 150,
      fadeMs: 650, // Slightly longer than overlay animation for gentler fade
      energyThreshold: isLinux ? 0.003 : 0.002
    };
  }

  _isLinux(): boolean {
    const ua = navigator.userAgent || '';
    if (ua.includes('Android')) return false;
    return ua.includes('Linux');
  }

  _sleep(durationMs: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, durationMs));
  }

  _clearTimers(): void {
    if (this._unmuteTimeout) {
      clearTimeout(this._unmuteTimeout);
      this._unmuteTimeout = null;
    }
    if (this._energyTimer) {
      clearTimeout(this._energyTimer);
      this._energyTimer = null;
    }
  }

  _removeTrackListeners(): void {
    if (this._audioTrack && this._trackUnmuteHandler) {
      this._audioTrack.removeEventListener('unmute', this._trackUnmuteHandler);
      this._trackUnmuteHandler = null;
    }
  }
}
