import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventEmitter } from 'node:events';

interface FakeChild extends EventEmitter {
  readonly stdout: EventEmitter;
  readonly stderr: EventEmitter;
  readonly kill: ReturnType<typeof vi.fn>;
}

const { spawned } = vi.hoisted(() => ({
  spawned: [] as Array<{ command: string; args: string[]; child: FakeChild }>
}));

vi.mock('node:child_process', async () => {
  const { EventEmitter: Emitter } = await import('node:events');
  return {
    spawn: vi.fn((command: string, args: string[]) => {
      const child = Object.assign(new Emitter(), {
        stdout: new Emitter(),
        stderr: new Emitter(),
        kill: vi.fn()
      });
      spawned.push({ command, args, child });
      return child;
    })
  };
});

vi.mock('@main/infrastructure/transcode/ffmpeg-path.utils', () => ({
  getFfmpegPath: () => '/bin/ffmpeg',
  getOptionalFfprobePath: () => null
}));

import { TranscodeProcess, probeDuration } from '@main/infrastructure/transcode/transcode-process';

describe('TranscodeProcess', () => {
  const lastChild = () => spawned.at(-1)?.child as FakeChild;

  beforeEach(() => {
    spawned.length = 0;
    vi.useFakeTimers({ now: 1_000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('places the input arguments before -i and the codec arguments before the output', () => {
    const run = new TranscodeProcess('/tmp/in.webm', '/dl/out.mp4', ['-c:v', 'libx264'], 0, ['-fflags', '+genpts']);
    void run.start().catch(() => {});

    expect(spawned[0].command).toBe('/bin/ffmpeg');
    expect(spawned[0].args).toEqual([
      '-y', '-fflags', '+genpts', '-i', '/tmp/in.webm', '-progress', 'pipe:1', '-nostats', '-c:v', 'libx264', '/dl/out.mp4'
    ]);
  });

  it('reports throttled progress as a percentage of the probed duration', () => {
    const run = new TranscodeProcess('/in', '/out', [], 2_000_000);
    const progress = vi.fn();
    run.on('progress', progress);
    void run.start();

    vi.setSystemTime(1_200);
    lastChild().stdout.emit('data', Buffer.from('frame=1\nout_time_us=500000\n'));
    vi.setSystemTime(1_250);
    lastChild().stdout.emit('data', Buffer.from('out_time_us=900000\n'));

    expect(progress).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenCalledWith({ percent: 25, timeUs: 500000, elapsedMs: 200 });
  });

  it('reports -1 percent when the duration is unknown', () => {
    const run = new TranscodeProcess('/in', '/out', [], 0);
    const progress = vi.fn();
    run.on('progress', progress);
    void run.start();

    vi.setSystemTime(1_500);
    lastChild().stdout.emit('data', Buffer.from('out_time_us=100\n'));

    expect(progress).toHaveBeenCalledWith({ percent: -1, timeUs: 100, elapsedMs: 500 });
  });

  it('emits completion with a final 100 percent progress on exit code 0', async () => {
    const run = new TranscodeProcess('/in', '/dl/out.mp4', [], 42);
    const events: unknown[] = [];
    run.on('progress', (data) => events.push(['progress', data]));
    run.on('completed', (data) => events.push(['completed', data]));
    const done = run.start();

    lastChild().emit('close', 0, null);

    await expect(done).resolves.toBeUndefined();
    expect(events).toEqual([
      ['progress', { percent: 100, timeUs: 42 }],
      ['completed', { outputPath: '/dl/out.mp4' }]
    ]);
  });

  it('turns the first ffmpeg error line into the error message', async () => {
    const run = new TranscodeProcess('/in', '/out', [], 0);
    const onError = vi.fn();
    run.on('error', onError);
    const done = run.start();

    lastChild().stderr.emit('data', Buffer.from('ffmpeg version 7\n/in: Invalid data found when processing input\n'));
    lastChild().emit('close', 1, null);

    await expect(done).rejects.toThrow('/in: Invalid data found when processing input');
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: '/in: Invalid data found when processing input' }));
  });

  it('falls back to the exit code when stderr is empty', async () => {
    const run = new TranscodeProcess('/in', '/out', [], 0);
    run.on('error', () => {});
    const done = run.start();

    lastChild().emit('close', 9, 'SIGKILL');

    await expect(done).rejects.toThrow('FFmpeg exited with code 9 (signal: SIGKILL)');
  });

  it('cancels with SIGTERM, escalates to SIGKILL after 2 s and emits cancelled on exit', async () => {
    const run = new TranscodeProcess('/in', '/out', [], 0);
    const onCancelled = vi.fn();
    run.on('cancelled', onCancelled);
    const done = run.start();

    run.cancel();
    run.cancel();
    expect(lastChild().kill).toHaveBeenCalledTimes(1);
    expect(lastChild().kill).toHaveBeenCalledWith('SIGTERM');

    vi.advanceTimersByTime(2000);
    expect(lastChild().kill).toHaveBeenLastCalledWith('SIGKILL');

    lastChild().emit('close', null, 'SIGKILL');

    await expect(done).rejects.toThrow('Transcode cancelled');
    await expect(run.waitForExit()).rejects.toThrow('Transcode cancelled');
    expect(onCancelled).toHaveBeenCalledTimes(1);
  });

  it('does not escalate once ffmpeg exited after SIGTERM', () => {
    const run = new TranscodeProcess('/in', '/out', [], 0);
    run.on('cancelled', () => {});
    void run.start().catch(() => {});

    run.cancel();
    lastChild().emit('close', null, 'SIGTERM');
    vi.advanceTimersByTime(5000);

    expect(lastChild().kill).toHaveBeenCalledTimes(1);
  });
});

describe('probeDuration', () => {
  it('resolves 0 without spawning when ffprobe is unavailable', async () => {
    spawned.length = 0;

    await expect(probeDuration('/in.webm')).resolves.toBe(0);
    expect(spawned).toHaveLength(0);
  });
});
