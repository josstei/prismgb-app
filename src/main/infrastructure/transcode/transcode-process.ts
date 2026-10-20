import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { DisposableBag } from '@platform/core';
import { getFfmpegPath, getOptionalFfprobePath } from './ffmpeg-path.utils';

export interface TranscodeProgressData {
  percent: number;
  timeUs: number;
  elapsedMs?: number;
}

/** Progress emissions are throttled to this interval to avoid IPC spam. */
const PROGRESS_INTERVAL_MS = 100;
const PROBE_DURATION_TIMEOUT_MS = 10000;
const FORCE_KILL_DELAY_MS = 2000;
const FORCE_KILL_LIFECYCLE = Symbol('transcodeForceKill');

/** Resolves the media duration in microseconds, or 0 when ffprobe is unavailable. */
export async function probeDuration(inputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobePath = getOptionalFfprobePath();
    if (!ffprobePath) {
      resolve(0);
      return;
    }
    const args = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      inputPath
    ];

    const proc = spawn(ffprobePath, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('FFprobe timed out'));
    }, PROBE_DURATION_TIMEOUT_MS);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        const duration = parseFloat(stdout.trim());
        if (isNaN(duration)) {
          reject(new Error(`Invalid duration from ffprobe: ${stdout}`));
        } else {
          resolve(Math.floor(duration * 1_000_000));
        }
      } else {
        reject(new Error(`FFprobe failed with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

/**
 * One ffmpeg run. Emits 'progress' (TranscodeProgressData), 'completed', 'cancelled'
 * and 'error' (Error); start() resolves on success and rejects otherwise.
 */
export class TranscodeProcess extends EventEmitter {
  readonly disposables = new DisposableBag();
  private readonly ffmpegArgs: readonly string[];
  private readonly inputArgs: readonly string[];
  private child: ChildProcess | null = null;
  private wasKilled = false;
  private startTime: number | null = null;
  private lastProgressEmit = 0;
  private completionPromise: Promise<void> | null = null;

  /** inputArgs are applied before -i. */
  constructor(
    private readonly inputPath: string,
    private readonly outputPath: string,
    ffmpegArgs: readonly string[],
    private readonly durationUs: number,
    inputArgs: readonly string[] = []
  ) {
    super();
    this.ffmpegArgs = [...ffmpegArgs];
    this.inputArgs = [...inputArgs];
  }

  start(): Promise<void> {
    this.completionPromise = new Promise((resolve, reject) => {
      if (this.child) {
        reject(new Error('Process already started'));
        return;
      }

      this.startTime = Date.now();

      const args = [
        '-y',
        ...this.inputArgs,
        '-i', this.inputPath,
        '-progress', 'pipe:1',
        '-nostats',
        ...this.ffmpegArgs,
        this.outputPath
      ];

      const child = spawn(getFfmpegPath(), args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      this.child = child;

      let stderrBuffer = '';

      child.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          this.parseProgressLine(line.trim());
        }
      });

      child.stderr?.on('data', (data) => {
        stderrBuffer += data.toString();
      });

      child.on('close', (code, signal) => {
        this.child = null;
        this.disposables.cancel(FORCE_KILL_LIFECYCLE);

        if (this.wasKilled) {
          this.emit('cancelled');
          reject(new Error('Transcode cancelled'));
          return;
        }

        if (code === 0) {
          this.emit('progress', { percent: 100, timeUs: this.durationUs });
          this.emit('completed', { outputPath: this.outputPath });
          resolve();
        } else {
          const errorMessage = this.extractErrorMessage(stderrBuffer) ||
            `FFmpeg exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`;
          const error = new Error(errorMessage);
          this.emit('error', error);
          reject(error);
        }
      });

      child.on('error', (error) => {
        this.child = null;
        this.disposables.cancel(FORCE_KILL_LIFECYCLE);
        this.emit('error', error);
        reject(error);
      });
    });
    return this.completionPromise;
  }

  private parseProgressLine(line: string): void {
    if (!line.startsWith('out_time_us=')) {
      return;
    }

    const timeUs = parseInt(line.substring(12), 10);
    if (isNaN(timeUs) || this.startTime === null) {
      return;
    }

    const now = Date.now();
    if (now - this.lastProgressEmit < PROGRESS_INTERVAL_MS) {
      return;
    }
    this.lastProgressEmit = now;

    // -1 marks an unknown duration (the renderer shows a spinner)
    const percent = this.durationUs > 0
      ? Math.round(Math.min(100, Math.max(0, (timeUs / this.durationUs) * 100)) * 10) / 10
      : -1;

    this.emit('progress', { percent, timeUs, elapsedMs: now - this.startTime });
  }

  private extractErrorMessage(stderr: string): string | null {
    if (!stderr) return null;

    const lines = stderr.split('\n');
    for (const line of lines) {
      if (line.includes('Error') || line.includes('error:')) {
        return line.trim();
      }
      if (line.includes('Invalid') || line.includes('Cannot') || line.includes('No such')) {
        return line.trim();
      }
    }

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line && !line.startsWith('frame=') && !line.startsWith('size=')) {
        return line;
      }
    }

    return null;
  }

  /** Sends SIGTERM, then SIGKILL if ffmpeg is still running after FORCE_KILL_DELAY_MS. */
  cancel(): void {
    if (!this.child || this.wasKilled) {
      return;
    }

    this.wasKilled = true;
    this.child.kill('SIGTERM');
    this.disposables.schedule(FORCE_KILL_LIFECYCLE, () => {
      this.child?.kill('SIGKILL');
    }, FORCE_KILL_DELAY_MS);
  }

  waitForExit(): Promise<void> {
    return this.completionPromise ?? Promise.resolve();
  }
}
