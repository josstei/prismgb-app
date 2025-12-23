/**
 * Audio Warmup Service
 *
 * Routes stream audio through Web Audio and gates output until the
 * audio track stabilizes, preventing startup distortion.
 */

import { BaseService } from '@shared/base/service.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

export class AudioWarmupService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['eventBus', 'loggerFactory', 'settingsService'], 'AudioWarmupService');

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

    this._unsubscribeVolume = this.eventBus.subscribe(
      EventChannels.SETTINGS.VOLUME_CHANGED,
      (volume) => this._handleVolumeChanged(volume)
    );
  }

  async start(stream) {
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
      this._audioContext.close().catch(() => {});
      this._audioContext = null;
    }

    this._stream = null;
    this._audioTrack = null;
  }

  cleanup() {
    this.stop();
    if (this._unsubscribeVolume) {
      this._unsubscribeVolume();
      this._unsubscribeVolume = null;
    }
  }

  isReady() {
    return this._isReady;
  }

  _handleVolumeChanged(volume) {
    const clamped = Math.max(0, Math.min(100, volume));
    this._volume = clamped;
    this._targetGain = clamped / 100;

    if (this._gainNode && this._audioContext && this._isReady) {
      const now = this._audioContext.currentTime;
      this._gainNode.gain.setTargetAtTime(this._targetGain, now, 0.02);
    }
  }

  _createAudioContext(trackSampleRate) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }

    if (trackSampleRate) {
      try {
        return new AudioContextCtor({ sampleRate: trackSampleRate });
      } catch (error) {
        this.logger.debug('AudioContext sampleRate override failed, retrying default:', error);
      }
    }

    try {
      return new AudioContextCtor();
    } catch (error) {
      this.logger.error('AudioContext creation failed:', error);
      return null;
    }
  }

  _waitForTrackUnmute(track, timeoutMs, token) {
    return new Promise((resolve) => {
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
      const finish = (result) => {
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

  _waitForAudioEnergy({ timeoutMs, threshold, token }) {
    return new Promise((resolve) => {
      if (!this._analyserNode) {
        resolve({ ready: false, reason: 'no-analyser', rms: 0, elapsedMs: 0 });
        return;
      }

      const buffer = new Uint8Array(this._analyserNode.fftSize);
      let aboveCount = 0;
      const start = performance.now();

      const sample = () => {
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

  _computeRms(buffer) {
    if (!buffer || buffer.length === 0) return 0;

    let sum = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      const value = (buffer[i] - 128) / 128;
      sum += value * value;
    }
    return Math.sqrt(sum / buffer.length);
  }

  _fadeTo(targetGain, fadeMs) {
    if (!this._gainNode || !this._audioContext) return;

    const now = this._audioContext.currentTime;
    const clamped = Math.max(0, Math.min(1, targetGain));
    this._gainNode.gain.cancelScheduledValues(now);
    this._gainNode.gain.setValueAtTime(this._gainNode.gain.value, now);
    this._gainNode.gain.linearRampToValueAtTime(clamped, now + (fadeMs / 1000));
  }

  _getWarmupTimings() {
    const isLinux = this._isLinux();
    return {
      unmuteTimeoutMs: isLinux ? 1800 : 1200,
      energyTimeoutMs: isLinux ? 1000 : 600,
      stabilizeDelayMs: isLinux ? 300 : 150,
      fadeMs: isLinux ? 200 : 120,
      energyThreshold: isLinux ? 0.003 : 0.002
    };
  }

  _isLinux() {
    const ua = navigator.userAgent || '';
    if (ua.includes('Android')) return false;
    return ua.includes('Linux');
  }

  _sleep(durationMs) {
    return new Promise(resolve => setTimeout(resolve, durationMs));
  }

  _clearTimers() {
    if (this._unmuteTimeout) {
      clearTimeout(this._unmuteTimeout);
      this._unmuteTimeout = null;
    }
    if (this._energyTimer) {
      clearTimeout(this._energyTimer);
      this._energyTimer = null;
    }
  }

  _removeTrackListeners() {
    if (this._audioTrack && this._trackUnmuteHandler) {
      this._audioTrack.removeEventListener('unmute', this._trackUnmuteHandler);
      this._trackUnmuteHandler = null;
    }
  }
}
