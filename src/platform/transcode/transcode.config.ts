import type { TranscodeFormat } from '@platform/ipc';

type TranscodeFormatConfig = Readonly<{
  extension: string;
  mimeType: string;
  label: string;
  ffmpegArgs: readonly string[];
}>;

const FORMAT_WEBM: TranscodeFormatConfig = Object.freeze({
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

const FORMAT_MP4: TranscodeFormatConfig = Object.freeze({
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

const FORMAT_MOV: TranscodeFormatConfig = Object.freeze({
  extension: 'mov',
  mimeType: 'video/quicktime',
  label: 'MOV (ProRes)',
  ffmpegArgs: [
    '-c:v', 'prores_ks',
    '-profile:v', '1',
    '-c:a', 'pcm_s16le'
  ]
});

export const TranscodeState = Object.freeze({
  IDLE: 'idle',
  TRANSCODING: 'transcoding',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  ERROR: 'error'
} as const);

const TRANSCODE_FORMATS: Readonly<Record<TranscodeFormat, TranscodeFormatConfig>> = Object.freeze({
  webm: FORMAT_WEBM,
  mp4: FORMAT_MP4,
  mov: FORMAT_MOV
});

export const TRANSCODE_CONFIG = Object.freeze({
  formats: TRANSCODE_FORMATS,

  defaultFormat: 'mp4',
  tempPrefix: 'prismgb-transcode-',
  progressIntervalMs: 100,
  probeDurationTimeoutMs: 10000
} as const);

export type TranscodeFormatKey = TranscodeFormat;
