import {
  createFixtureDeviceInfoPayload,
  createFixtureDeviceStatus,
  getDeviceFixtureProfile,
} from '@prismgb/devices/testkit';

const chromaticProfile = getDeviceFixtureProfile();
const { descriptor, fixture } = chromaticProfile;

export const CHROMATIC_MEDIA_FIXTURE = {
  device: {
    label: fixture.label,
  },
  usbDeviceInfo: chromaticProfile.usbDeviceInfo,
  display: {
    aspectRatio: descriptor.display.aspectRatio,
    nativeHeight: descriptor.display.nativeHeight,
    nativeWidth: descriptor.display.nativeWidth,
  },
  videoDevice: chromaticProfile.videoDevice,
  audioDevice: chromaticProfile.audioDevice,
  videoSettings: chromaticProfile.trackSettings.video,
  audioSettings: chromaticProfile.trackSettings.audio,
  stream: {
    defaultFrameRate: fixture.defaultFrameRate,
  },
};

export function createChromaticDeviceInfoPayload(overrides = {}) {
  return createFixtureDeviceInfoPayload(descriptor, overrides);
}

export function createChromaticDeviceStatusPayload(connected = true, deviceOverrides = {}) {
  return createFixtureDeviceStatus(descriptor, connected, deviceOverrides);
}

export const TestPatterns = {
  SOLID_GRAY: 'solid-gray',
  COLOR_BARS: 'color-bars',
};

export async function installChromaticMediaEnvironment(page, options = {}) {
  const {
    autoConnect = false,
    testPattern = 'color-bars',
    includeAudio = true,
    installMediaRecorder = true,
  } = options;

  // Install the media environment into the page.
  await page.evaluate(
    ({ fixture, testPattern, includeAudio, installMediaRecorder }) => {
      window.__chromaticMediaEnvironment = {
        isConnected: false,
        deviceInfo: null,
        testPattern,
        includeAudio,
        fixture,
        deviceChangeListeners: [],
        activeStreams: [],
      };

      const state = window.__chromaticMediaEnvironment;
      state.cleanupStreams = () => {
        state.activeStreams.splice(0).forEach((stream) => stream.__chromaticCleanup?.());
      };
      state.dispatchDeviceChange = () => {
        const event = new Event('devicechange');
        state.deviceChangeListeners.forEach((listener) => {
          try {
            listener(event);
          } catch (e) {
            console.error(e);
          }
        });
        navigator.mediaDevices.dispatchEvent(event);
      };
      const { display, videoDevice, audioDevice, videoSettings, audioSettings } = fixture;
      const streamSettings = fixture.stream;

      const originalEnumerateDevices =
        navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
      const originalGetUserMedia =
        navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      const originalAddEventListener =
        navigator.mediaDevices.addEventListener.bind(navigator.mediaDevices);
      const originalRemoveEventListener =
        navigator.mediaDevices.removeEventListener.bind(navigator.mediaDevices);
      const originalMediaRecorder = window.MediaRecorder;

      function installChromaticMediaRecorder() {
        class ChromaticMediaRecorder extends EventTarget {
          static isTypeSupported(type) {
            return typeof type === 'string' && type.startsWith('video/webm');
          }

          constructor(stream, recorderOptions = {}) {
            super();
            this.stream = stream;
            this.mimeType = recorderOptions.mimeType ?? 'video/webm';
            this.state = 'inactive';
            this._timesliceTimer = null;
          }

          start(timeslice) {
            if (this.state !== 'inactive') {
              throw new DOMException('MediaRecorder is already recording', 'InvalidStateError');
            }

            this.state = 'recording';
            this.requestData();

            if (Number.isFinite(timeslice) && timeslice > 0) {
              this._timesliceTimer = window.setInterval(() => {
                if (this.state === 'recording') {
                  this.requestData();
                }
              }, timeslice);
            }
          }

          stop() {
            if (this.state === 'inactive') {
              return;
            }

            this.requestData();
            this.state = 'inactive';

            if (this._timesliceTimer) {
              window.clearInterval(this._timesliceTimer);
              this._timesliceTimer = null;
            }

            window.setTimeout(() => {
              this.dispatchEvent(new Event('stop'));
            }, 0);
          }

          requestData() {
            if (this.state !== 'recording') {
              return;
            }

            const blob = new Blob([`chromatic-recording-${Date.now()}`], {
              type: this.mimeType || 'video/webm',
            });
            this.dispatchEvent(new BlobEvent('dataavailable', { data: blob }));
          }
        }

        window.MediaRecorder = ChromaticMediaRecorder;
      }

      if (installMediaRecorder) {
        installChromaticMediaRecorder();
      }

      function createNotFoundError() {
        const error = new Error('Requested device not found');
        error.name = 'NotFoundError';
        return error;
      }

      function exactDeviceIdFromConstraint(constraint) {
        if (!constraint) {
          return null;
        }

        if (typeof constraint === 'string') {
          return constraint;
        }

        if (typeof constraint === 'object' && 'exact' in constraint) {
          return constraint.exact == null ? null : String(constraint.exact);
        }

        return null;
      }

      function assertRequestedDevice(trackConstraints, device) {
        if (!trackConstraints || typeof trackConstraints !== 'object') {
          return;
        }

        const requestedDeviceId = exactDeviceIdFromConstraint(trackConstraints.deviceId);
        if (requestedDeviceId && requestedDeviceId !== device.deviceId) {
          throw createNotFoundError();
        }
      }

      function createSyntheticVideoStream() {
        const canvas = document.createElement('canvas');
        canvas.width = display.nativeWidth;
        canvas.height = display.nativeHeight;
        const ctx = canvas.getContext('2d');

        let frameCount = 0;
        let animationId = null;

        function renderFrame() {
          frameCount++;

          switch (state.testPattern) {
            case 'solid-gray':
              ctx.fillStyle = '#808080';
              ctx.fillRect(0, 0, display.nativeWidth, display.nativeHeight);
              break;

            case 'color-bars': {
              const colors = ['#fff', '#ff0', '#0ff', '#0f0', '#f0f', '#f00', '#00f', '#000'];
              const barWidth = display.nativeWidth / colors.length;
              colors.forEach((c, i) => {
                ctx.fillStyle = c;
                ctx.fillRect(i * barWidth, 0, barWidth, display.nativeHeight);
              });
              break;
            }

            case 'animated': {
              ctx.fillStyle = '#0f0f1e';
              ctx.fillRect(0, 0, display.nativeWidth, display.nativeHeight);
              const x = (frameCount * 2) % (display.nativeWidth + 20) - 20;
              ctx.fillStyle = '#48bb78';
              ctx.fillRect(x, 0, 20, display.nativeHeight);
              break;
            }

            default:
              ctx.fillStyle = '#4a5568';
              ctx.fillRect(0, 0, display.nativeWidth, display.nativeHeight);
          }

          animationId = requestAnimationFrame(renderFrame);
        }

        renderFrame();

        const stream = canvas.captureStream(streamSettings.defaultFrameRate);

        stream.__chromaticCanvas = canvas;
        stream.__chromaticAnimationId = animationId;
        stream.__chromaticCleanup = () => {
          if (animationId) cancelAnimationFrame(animationId);
        };

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const originalGetSettings = videoTrack.getSettings.bind(videoTrack);
          videoTrack.getSettings = () => ({
            ...originalGetSettings(),
            ...videoSettings,
          });
        }

        return stream;
      }

      function createSyntheticAudioStream() {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: audioSettings.sampleRate,
        });

        const oscillator = audioCtx.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.value = 440;

        const gainNode = audioCtx.createGain();
        gainNode.gain.value = 0;

        const destination = audioCtx.createMediaStreamDestination();

        oscillator.connect(gainNode);
        gainNode.connect(destination);
        oscillator.start();

        const stream = destination.stream;

        stream.__chromaticAudioCtx = audioCtx;
        stream.__chromaticOscillator = oscillator;
        stream.__chromaticGainNode = gainNode;
        stream.__chromaticCleanup = () => {
          oscillator.stop();
          oscillator.disconnect();
          gainNode.disconnect();
          audioCtx.close();
        };

        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          const originalGetSettings = audioTrack.getSettings.bind(audioTrack);
          audioTrack.getSettings = () => ({
            ...originalGetSettings(),
            ...audioSettings,
          });
        }

        return stream;
      }

      navigator.mediaDevices.enumerateDevices = async () => {
        const devices = [];

        if (state.isConnected) {
          devices.push({
            ...videoDevice,
            toJSON() {
              return this;
            },
          });

          if (state.includeAudio) {
            devices.push({
              ...audioDevice,
              toJSON() {
                return this;
              },
            });
          }
        }

        return devices;
      };

      navigator.mediaDevices.getUserMedia = async (constraints = {}) => {
        if (!state.isConnected) {
          throw createNotFoundError();
        }

        const tracks = [];

        if (constraints.video) {
          assertRequestedDevice(constraints.video, videoDevice);
          const videoStream = createSyntheticVideoStream();
          videoStream.getVideoTracks().forEach((t) => tracks.push(t));
          state.activeStreams.push(videoStream);
        }

        if (constraints.audio && state.includeAudio) {
          assertRequestedDevice(constraints.audio, audioDevice);
          const audioStream = createSyntheticAudioStream();
          audioStream.getAudioTracks().forEach((t) => tracks.push(t));
          state.activeStreams.push(audioStream);
        }

        return new MediaStream(tracks);
      };

      navigator.mediaDevices.addEventListener = (type, listener, options) => {
        if (type === 'devicechange') {
          state.deviceChangeListeners.push(listener);
        }
        return originalAddEventListener(type, listener, options);
      };

      navigator.mediaDevices.removeEventListener = (type, listener, options) => {
        if (type === 'devicechange') {
          const idx = state.deviceChangeListeners.indexOf(listener);
          if (idx > -1) state.deviceChangeListeners.splice(idx, 1);
        }
        return originalRemoveEventListener(type, listener, options);
      };

      window.__chromaticMediaEnvironment.__originals = {
        enumerateDevices: originalEnumerateDevices,
        getUserMedia: originalGetUserMedia,
        addEventListener: originalAddEventListener,
        removeEventListener: originalRemoveEventListener,
        MediaRecorder: originalMediaRecorder,
      };
    },
    { fixture: CHROMATIC_MEDIA_FIXTURE, testPattern, includeAudio, installMediaRecorder }
  );

  if (autoConnect) {
    await connectChromaticMedia(page);
  }

  return {
    connect: () => connectChromaticMedia(page),
    disconnect: () => disconnectChromaticMedia(page),
    setTestPattern: (pattern) => setChromaticTestPattern(page, pattern),
    cleanup: () => cleanupChromaticMediaEnvironment(page),
    getStatus: () => getChromaticMediaEnvironmentStatus(page),
  };
}

export async function connectChromaticMedia(page) {
  await page.evaluate(() => {
    const state = window.__chromaticMediaEnvironment;
    if (!state) {
      console.error('Chromatic media environment not installed');
      return;
    }

    state.isConnected = true;
    state.deviceInfo = { ...state.fixture.usbDeviceInfo };
    state.dispatchDeviceChange();
  });
}

export async function disconnectChromaticMedia(page) {
  await page.evaluate(() => {
    const state = window.__chromaticMediaEnvironment;
    if (!state) return;

    state.cleanupStreams();
    state.isConnected = false;
    state.deviceInfo = null;
    state.dispatchDeviceChange();
  });
}

export async function setChromaticTestPattern(page, pattern) {
  await page.evaluate((p) => {
    if (window.__chromaticMediaEnvironment) {
      window.__chromaticMediaEnvironment.testPattern = p;
    }
  }, pattern);
}

export async function getChromaticMediaEnvironmentStatus(page) {
  return page.evaluate(() => {
    const state = window.__chromaticMediaEnvironment;
    if (!state) {
      return { injected: false, isConnected: false };
    }
    return {
      injected: true,
      isConnected: state.isConnected,
      deviceInfo: state.deviceInfo,
      testPattern: state.testPattern,
      includeAudio: state.includeAudio,
    };
  });
}

export async function cleanupChromaticMediaEnvironment(page) {
  await page.evaluate(() => {
    const state = window.__chromaticMediaEnvironment;
    if (!state) return;

    state.cleanupStreams();

    const originals = state.__originals;
    if (originals) {
      if (originals.enumerateDevices) {
        navigator.mediaDevices.enumerateDevices = originals.enumerateDevices;
      }
      if (originals.getUserMedia) {
        navigator.mediaDevices.getUserMedia = originals.getUserMedia;
      }
      if (originals.addEventListener) {
        navigator.mediaDevices.addEventListener = originals.addEventListener;
      }
      if (originals.removeEventListener) {
        navigator.mediaDevices.removeEventListener = originals.removeEventListener;
      }
      if (originals.MediaRecorder) {
        window.MediaRecorder = originals.MediaRecorder;
      }
    }

    delete window.__chromaticMediaEnvironment;
  });
}
