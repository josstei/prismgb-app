/**
 * Transcode Configuration - Browser-safe
 *
 * Pure constants for video transcoding.
 * No Node.js dependencies - safe for renderer process.
 */

// =============================================================================
// FORMAT CONFIGURATIONS
// =============================================================================

const FORMAT_WEBM = Object.freeze({
  extension: 'webm',
  mimeType: 'video/webm',
  label: 'WebM (VP9)',
  ffmpegArgs: [
    '-c:v', 'libvpx-vp9',
    '-crf', '30',
    '-b:v', '0',
    '-c:a', 'libopus',
    '-b:a', '128k'
  ]
});

const FORMAT_MP4 = Object.freeze({
  extension: 'mp4',
  mimeType: 'video/mp4',
  label: 'MP4 (H.264)',
  ffmpegArgs: [
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart'
  ]
});

const FORMAT_MOV = Object.freeze({
  extension: 'mov',
  mimeType: 'video/quicktime',
  label: 'MOV (ProRes)',
  ffmpegArgs: [
    '-c:v', 'prores_ks',
    '-profile:v', '1',
    '-c:a', 'pcm_s16le'
  ]
});

// =============================================================================
// TRANSCODE STATES
// =============================================================================

export const TranscodeState = Object.freeze({
  IDLE: 'idle',
  TRANSCODING: 'transcoding',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  ERROR: 'error'
});

// =============================================================================
// EXPORTED CONFIGURATION
// =============================================================================

export const TRANSCODE_CONFIG = Object.freeze({
  // Supported output formats
  formats: Object.freeze({
    webm: FORMAT_WEBM,
    mp4: FORMAT_MP4,
    mov: FORMAT_MOV
  }),

  // Default format
  defaultFormat: 'mp4',

  // Temp file prefix for transcode sessions
  tempPrefix: 'prismgb-transcode-',

  // Progress update interval (ms) - used to throttle IPC emissions
  progressIntervalMs: 100,

  // Timeout for ffprobe duration detection (ms)
  probeDurationTimeoutMs: 10000
});
