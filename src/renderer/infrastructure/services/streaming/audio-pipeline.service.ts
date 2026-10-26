import { BaseService, DisposableBag, abortableDelay, getErrorMessage } from '@platform/core';
import { EventChannels, type TypedEventBusLike } from '@platform/events';
import type { LoggerFactoryLike } from '@platform/core';
import type { SettingsAccess } from '@renderer/lib/settings.definitions';
import { computeRms, createEaseInCurve } from './audio-gain.utils.js';

type AudioSession = {
  stream: MediaStream;
  abort: AbortController;
  context: AudioContext | null;
  gain: GainNode | null;
  ready: boolean;
  startup: Promise<boolean> | null;
};
type AudioWarmupResult = { ready: boolean; elapsedMs: number };
type AudioEnergyResult = AudioWarmupResult & { rms: number };
type AudioTimings = ReturnType<typeof getWarmupTimings>;
type StreamingAudioPipelineServiceDependencies = {
  eventBus: TypedEventBusLike;
  loggerFactory: LoggerFactoryLike;
  settingsService: Pick<SettingsAccess, 'getSetting'>;
};
const AUDIO_SESSION = Symbol('audioSession');

/** Owns one stream's audio graph, startup cancellation and gain control. */
export class StreamingAudioPipelineService extends BaseService {
  private session: AudioSession | null = null;
  private targetGain: number;

  constructor({ eventBus, loggerFactory, settingsService }: StreamingAudioPipelineServiceDependencies) {
    super({ loggerFactory, eventBus }, 'StreamingAudioPipelineService');
    this.targetGain = settingsService.getSetting('gameVolume') / 100;
    this.track(eventBus.subscribe(EventChannels.SETTINGS.VOLUME_CHANGED, (volume) => {
      this.targetGain = Math.max(0, Math.min(100, volume)) / 100;
      const session = this.session;
      if (session?.ready && session.gain && session.context) {
        session.gain.gain.setTargetAtTime(this.targetGain, session.context.currentTime, 0.02);
      }
    }));
  }

  async start(stream: MediaStream | null | undefined): Promise<boolean> {
    const current = this.session;
    if (current && current.stream === stream && current.context?.state !== 'closed') {
      return current.startup ?? current.ready;
    }
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

    const resources = new DisposableBag();
    const session: AudioSession = { stream, abort: new AbortController(), context: null, gain: null, ready: false, startup: null };
    this.session = session;
    this.replaceManaged(AUDIO_SESSION, () => {
      session.abort.abort();
      return resources.clear().catch((error) => this.logger.warn('Audio graph cleanup failed:', getErrorMessage(error)));
    });
    const startup = this.warmup(session, audioTrack, resources);
    session.startup = startup;
    try {
      return await startup;
    } finally {
      session.startup = null;
    }
  }

  private async warmup(session: AudioSession, audioTrack: MediaStreamTrack, resources: DisposableBag): Promise<boolean> {
    const signal = session.abort.signal;
    try {
      const startTime = performance.now();
      const trackSampleRate = audioTrack.getSettings().sampleRate ?? null;
      const context = this.createAudioContext(trackSampleRate);
      if (!context) {
        this.logger.warn('Audio warm-up failed - AudioContext unavailable');
        return false;
      }
      session.context = context;
      resources.add(() => context.close().catch((error) => this.logger.warn('AudioContext close failed:', getErrorMessage(error))));
      const source = context.createMediaStreamSource(session.stream);
      resources.add(() => source.disconnect());
      const analyser = context.createAnalyser();
      resources.add(() => analyser.disconnect());
      const gain = context.createGain();
      resources.add(() => gain.disconnect());
      session.gain = gain;
      gain.gain.value = 0;
      source.connect(analyser);
      analyser.connect(gain);
      gain.connect(context.destination);

      if (context.state === 'suspended') {
        try {
          await context.resume();
        } catch (error) {
          if (!signal.aborted) this.logger.warn('AudioContext resume failed:', getErrorMessage(error));
          return false;
        }
      }
      if (signal.aborted) return false;

      const timings = getWarmupTimings();
      this.logger.info('Audio warm-up started', { trackSampleRate, contextSampleRate: context.sampleRate, timings });
      const unmute = await waitForTrackUnmute(audioTrack, timings.unmuteTimeoutMs, signal);
      if (signal.aborted) return false;
      if (!unmute.ready) this.logger.warn('Audio track unmute timeout - continuing warm-up fallback');
      const energy = await waitForAudioEnergy(analyser, timings, signal);
      if (signal.aborted || !await abortableDelay(timings.stabilizeDelayMs, signal)) return false;

      const now = context.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.setValueCurveAtTime(createEaseInCurve(gain.gain.value, Math.max(0, Math.min(1, this.targetGain)), 64), now, timings.fadeMs / 1000);
      session.ready = true;
      this.logger.info('Audio warm-up complete', {
        elapsedMs: Math.round(performance.now() - startTime),
        unmuteMs: unmute.elapsedMs, energyMs: energy.elapsedMs,
        unmuteReady: unmute.ready, energyReady: energy.ready, energyRms: energy.rms
      });
      return true;
    } finally {
      // A superseded startup can finish or fail without releasing the new graph.
      if (!session.ready && this.session === session) this.stop();
    }
  }

  stop(): void {
    this.session = null;
    void this.cancelManaged(AUDIO_SESSION);
  }

  override dispose(): void | Promise<void> {
    this.stop();
    return super.dispose();
  }

  private createAudioContext(trackSampleRate: number | null): AudioContext | null {
    const AudioContextCtor = window.AudioContext;
    if (!AudioContextCtor) return null;
    if (trackSampleRate) {
      try { return new AudioContextCtor({ sampleRate: trackSampleRate }); }
      catch (error) { this.logger.debug('AudioContext sampleRate override failed, retrying default:', getErrorMessage(error)); }
    }
    try { return new AudioContextCtor(); }
    catch (error) {
      this.logger.error('AudioContext creation failed:', getErrorMessage(error));
      return null;
    }
  }
}

function waitForTrackUnmute(track: MediaStreamTrack, timeoutMs: number, signal: AbortSignal): Promise<AudioWarmupResult> {
  if (signal.aborted || !track.muted) return Promise.resolve({ ready: !signal.aborted, elapsedMs: 0 });
  return new Promise((resolve) => {
    const start = performance.now();
    const finish = (ready: boolean) => {
      clearTimeout(timeout);
      track.removeEventListener('unmute', unmute);
      signal.removeEventListener('abort', abort);
      resolve({ ready, elapsedMs: Math.round(performance.now() - start) });
    };
    const unmute = () => finish(true);
    const abort = () => finish(false);
    const timeout = setTimeout(() => finish(false), timeoutMs);
    track.addEventListener('unmute', unmute, { once: true });
    signal.addEventListener('abort', abort, { once: true });
  });
}

function waitForAudioEnergy(analyser: AnalyserNode, timings: AudioTimings, signal: AbortSignal): Promise<AudioEnergyResult> {
  return new Promise((resolve, reject) => {
    const buffer = new Uint8Array(analyser.fftSize);
    const start = performance.now();
    let aboveCount = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (timer !== null) clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    };
    const finish = (ready: boolean, rms = 0) => {
      cleanup();
      resolve({ ready, rms, elapsedMs: Math.round(performance.now() - start) });
    };
    const abort = () => finish(false);
    const sample = () => {
      if (signal.aborted) { finish(false); return; }
      try { analyser.getByteTimeDomainData(buffer); }
      catch (error) { cleanup(); reject(error); return; }
      const rms = computeRms(buffer);
      aboveCount = rms >= timings.energyThreshold ? aboveCount + 1 : 0;
      if (aboveCount >= 2) { finish(true, rms); return; }
      if (performance.now() - start >= timings.energyTimeoutMs) { finish(false, rms); return; }
      timer = setTimeout(sample, 50);
    };
    signal.addEventListener('abort', abort, { once: true });
    sample();
  });
}

function getWarmupTimings() {
  const linux = navigator.userAgent.includes('Linux') && !navigator.userAgent.includes('Android');
  return {
    unmuteTimeoutMs: linux ? 1800 : 1200,
    energyTimeoutMs: linux ? 1000 : 600,
    stabilizeDelayMs: linux ? 300 : 150,
    fadeMs: 650,
    energyThreshold: linux ? 0.003 : 0.002
  };
}
