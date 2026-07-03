/**
 * Streaming Audio Pipeline Service
 *
 * Owns the complete audio pipeline for streaming:
 * - Routes stream audio through Web Audio API
 * - Gates output until the audio track stabilizes (warmup phase)
 * - Manages volume control and audio context lifecycle
 * - Prevents startup distortion through gradual fade-in
 */

import { injectable, inject } from 'inversify';
import { BaseService, abortableDelay } from '@platform/core';
import { EventChannels } from '@platform/events';
import { getErrorMessage } from '@platform/core';
import type { TypedEventBusLike } from '@platform/events';
import type { LoggerFactoryLike } from '@platform/core';
import { computeRms, createEaseInCurve } from './audio-gain.utils.js';
import { TOKENS } from '@renderer/application/di/tokens.js';

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

type TimerHandle = ReturnType<typeof setTimeout>;

type AudioEnergyOptions = {
  timeoutMs: number;
  threshold: number;
  token: number;
  signal: AbortSignal;
};

type SettingsServiceLike = {
  getNumberSetting(name: string): number;
};

const AUDIO_WARMUP_LIFECYCLE = Symbol('audioWarmup');
const VOLUME_SUBSCRIPTION_LIFECYCLE = Symbol('audioVolumeSubscription');

@injectable()
export class StreamingAudioPipelineService extends BaseService {
  private _audioContext: AudioContext | null;
  private _sourceNode: MediaStreamAudioSourceNode | null;
  private _gainNode: GainNode | null;
  private _analyserNode: AnalyserNode | null;
  private _stream: MediaStream | null;
  private _audioTrack: MediaStreamTrack | null;
  private _isReady: boolean;
  private _warmupToken: number;
  private _volume: number;
  private _targetGain: number;
  private _startPromise: Promise<boolean> | null;

  constructor(
    @inject(TOKENS.eventBus) private readonly eventBus: TypedEventBusLike,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactoryLike,
    @inject(TOKENS.settingsService) private readonly settingsService: SettingsServiceLike
  ) {
    super({ loggerFactory, eventBus }, 'StreamingAudioPipelineService');

    this._audioContext = null;
    this._sourceNode = null;
    this._gainNode = null;
    this._analyserNode = null;

    this._stream = null;
    this._audioTrack = null;
    this._isReady = false;
    this._warmupToken = 0;

    this._volume = this.settingsService.getNumberSetting('gameVolume');
    this._targetGain = this._volume / 100;

    this._startPromise = null;

    this.disposables.replace(
      VOLUME_SUBSCRIPTION_LIFECYCLE,
      this.eventBus.subscribe(
        EventChannels.SETTINGS.VOLUME_CHANGED,
        (volume) => this._handleVolumeChanged(volume)
      )
    );
  }

  async start(stream: MediaStream | null | undefined): Promise<boolean> {
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

  private async _startInternal(stream: MediaStream | null | undefined): Promise<boolean> {
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
    const warmupAbortController = new AbortController();
    const releaseWarmupLifecycle = this.disposables.replace(
      AUDIO_WARMUP_LIFECYCLE,
      () => warmupAbortController.abort()
    );
    let warmupCompleted = false;

    try {
      const startTime = performance.now();
      const trackSettings = audioTrack.getSettings?.();
      const trackSampleRate = trackSettings &&
        'sampleRate' in trackSettings &&
        typeof trackSettings.sampleRate === 'number'
        ? trackSettings.sampleRate
        : null;

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
          this.logger.warn('AudioContext resume failed:', getErrorMessage(error));
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

      const signal = warmupAbortController.signal;
      const unmuteResult = await this._waitForTrackUnmute(audioTrack, timings.unmuteTimeoutMs, token, signal);
      if (signal.aborted || token !== this._warmupToken) {
        return false;
      }
      if (!unmuteResult.ready) {
        this.logger.warn('Audio track unmute timeout - continuing warm-up fallback');
      }

      const energyResult = await this._waitForAudioEnergy({
        timeoutMs: timings.energyTimeoutMs,
        threshold: timings.energyThreshold,
        token,
        signal
      });
      if (signal.aborted || token !== this._warmupToken) {
        return false;
      }

      const stabilized = await abortableDelay(timings.stabilizeDelayMs, signal);
      if (!stabilized || signal.aborted || token !== this._warmupToken) {
        return false;
      }

      this._fadeTo(this._targetGain, timings.fadeMs);
      this._isReady = true;
      warmupCompleted = true;

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
    } finally {
      const shouldCleanupFailedStart = !warmupCompleted &&
        token === this._warmupToken &&
        !warmupAbortController.signal.aborted;
      releaseWarmupLifecycle();
      if (shouldCleanupFailedStart) {
        this.stop();
      }
    }
  }

  stop(): void {
    this._warmupToken += 1;
    this.disposables.cancel(AUDIO_WARMUP_LIFECYCLE);
    this._startPromise = null;
    this._isReady = false;

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
      this._audioContext.close().catch((error) => {
        this.logger.warn('AudioContext close failed:', getErrorMessage(error));
      });
      this._audioContext = null;
    }

    this._stream = null;
    this._audioTrack = null;
  }

  cleanup(): void | Promise<void> {
    this.stop();
    return super.dispose();
  }

  override dispose(): void | Promise<void> {
    this.stop();
    return super.dispose();
  }

  isReady(): boolean {
    return this._isReady;
  }

  private _handleVolumeChanged(volume: number): void {
    const clamped = Math.max(0, Math.min(100, volume));
    this._volume = clamped;
    this._targetGain = clamped / 100;

    if (this._gainNode && this._audioContext && this._isReady) {
      const now = this._audioContext.currentTime;
      this._gainNode.gain.setTargetAtTime(this._targetGain, now, 0.02);
    }
  }

  private _createAudioContext(trackSampleRate: number | null): AudioContext | null {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }

    if (trackSampleRate) {
      try {
        return new AudioContextCtor({ sampleRate: trackSampleRate });
      } catch (error) {
        this.logger.debug(
          'AudioContext sampleRate override failed, retrying default:',
          getErrorMessage(error)
        );
      }
    }

    try {
      return new AudioContextCtor();
    } catch (error) {
      this.logger.error('AudioContext creation failed:', getErrorMessage(error));
      return null;
    }
  }

  private _waitForTrackUnmute(
    track: MediaStreamTrack,
    timeoutMs: number,
    token: number,
    signal: AbortSignal
  ): Promise<AudioWarmupResult> {
    return new Promise<AudioWarmupResult>((resolve) => {
      if (signal.aborted || token !== this._warmupToken) {
        resolve({ ready: false, reason: 'canceled', elapsedMs: 0 });
        return;
      }

      if (track.muted === false) {
        resolve({ ready: true, reason: 'already-unmuted', elapsedMs: 0 });
        return;
      }

      const start = performance.now();
      let settled = false;
      let unmuteTimeout: TimerHandle | null = null;
      const finish = (result: Omit<AudioWarmupResult, 'elapsedMs'>) => {
        if (settled) return;
        settled = true;
        if (unmuteTimeout !== null) {
          clearTimeout(unmuteTimeout);
          unmuteTimeout = null;
        }
        track.removeEventListener('unmute', handleUnmute);
        signal.removeEventListener('abort', handleAbort);
        resolve({ ...result, elapsedMs: Math.round(performance.now() - start) });
      };

      const handleUnmute = () => {
        if (token !== this._warmupToken) return;
        finish({ ready: true, reason: 'unmute-event' });
      };

      const handleAbort = () => finish({ ready: false, reason: 'canceled' });

      track.addEventListener('unmute', handleUnmute, { once: true });
      signal.addEventListener('abort', handleAbort, { once: true });

      unmuteTimeout = setTimeout(() => {
        if (token !== this._warmupToken) {
          finish({ ready: false, reason: 'canceled' });
          return;
        }
        finish({ ready: false, reason: 'timeout' });
      }, timeoutMs);
    });
  }

  private _waitForAudioEnergy({
    timeoutMs,
    threshold,
    token,
    signal
  }: AudioEnergyOptions): Promise<AudioEnergyResult> {
    return new Promise<AudioEnergyResult>((resolve) => {
      if (signal.aborted || token !== this._warmupToken) {
        resolve({ ready: false, reason: 'canceled', rms: 0, elapsedMs: 0 });
        return;
      }

      if (!this._analyserNode) {
        resolve({ ready: false, reason: 'no-analyser', rms: 0, elapsedMs: 0 });
        return;
      }

      const buffer = new Uint8Array(this._analyserNode.fftSize);
      let aboveCount = 0;
      const start = performance.now();
      let settled = false;
      let energyTimer: TimerHandle | null = null;

      const finish = (result: Omit<AudioEnergyResult, 'elapsedMs'>): void => {
        if (settled) return;
        settled = true;
        if (energyTimer !== null) {
          clearTimeout(energyTimer);
          energyTimer = null;
        }
        signal.removeEventListener('abort', handleAbort);
        resolve({ ...result, elapsedMs: Math.round(performance.now() - start) });
      };

      const handleAbort = () => finish({ ready: false, reason: 'canceled', rms: 0 });

      const sample = (): void => {
        if (!this._analyserNode || token !== this._warmupToken || signal.aborted) {
          finish({ ready: false, reason: 'canceled', rms: 0 });
          return;
        }

        this._analyserNode.getByteTimeDomainData(buffer);
        const rms = this._computeRms(buffer);

        if (rms >= threshold) {
          aboveCount += 1;
          if (aboveCount >= 2) {
            finish({ ready: true, rms });
            return;
          }
        } else {
          aboveCount = 0;
        }

        if (performance.now() - start >= timeoutMs) {
          finish({ ready: false, reason: 'timeout', rms });
          return;
        }

        energyTimer = setTimeout(sample, 50);
      };

      signal.addEventListener('abort', handleAbort, { once: true });
      sample();
    });
  }

  private _computeRms(buffer: Uint8Array): number {
    return computeRms(buffer);
  }

  private _fadeTo(targetGain: number, fadeMs: number): void {
    if (!this._gainNode || !this._audioContext) return;

    const now = this._audioContext.currentTime;
    const clamped = Math.max(0, Math.min(1, targetGain));
    this._gainNode.gain.cancelScheduledValues(now);
    this._gainNode.gain.setValueAtTime(this._gainNode.gain.value, now);

    // Use ease-in curve for smooth perceived fade (human hearing is logarithmic)
    const curve = this._createEaseInCurve(this._gainNode.gain.value, clamped, 64);
    this._gainNode.gain.setValueCurveAtTime(curve, now, fadeMs / 1000);
  }

  private _createEaseInCurve(startValue: number, endValue: number, steps: number): Float32Array {
    return createEaseInCurve(startValue, endValue, steps);
  }

  private _getWarmupTimings(): {
    unmuteTimeoutMs: number;
    energyTimeoutMs: number;
    stabilizeDelayMs: number;
    fadeMs: number;
    energyThreshold: number;
  } {
    const isLinux = this._isLinux();
    return {
      unmuteTimeoutMs: isLinux ? 1800 : 1200,
      energyTimeoutMs: isLinux ? 1000 : 600,
      stabilizeDelayMs: isLinux ? 300 : 150,
      fadeMs: 650, // Slightly longer than overlay animation for gentler fade
      energyThreshold: isLinux ? 0.003 : 0.002
    };
  }

  private _isLinux(): boolean {
    const ua = navigator.userAgent || '';
    if (ua.includes('Android')) return false;
    return ua.includes('Linux');
  }
}
