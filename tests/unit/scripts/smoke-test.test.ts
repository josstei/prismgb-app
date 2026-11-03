import { EventEmitter } from 'node:events';
import type { spawn } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { runSmokeTest } from '../../../scripts/smoke-test.js';

function startSmoke(timeoutMs = 1000) {
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter()
  });
  const terminate = vi.fn().mockResolvedValue(undefined);
  const pending = runSmokeTest({
    executable: '/packaged/prismgb',
    spawnFn: vi.fn(() => child) as unknown as typeof spawn,
    terminate,
    timeoutMs,
    logger: { ...console, log: vi.fn(), error: vi.fn() }
  });
  return { child, pending, terminate };
}

describe('packaged smoke handshake', () => {
  it('requires renderer readiness and a clean exit, accepting split output chunks', async () => {
    const { child, pending } = startSmoke();
    child.stdout.emit('data', 'Starting\nPRISMGB_SMOKE_');
    child.stdout.emit('data', 'READY\n');
    child.emit('close', 0, null);
    expect((await pending).success).toBe(true);
  });

  it.each([
    [false, 0, null],
    [true, 1, null],
    [true, null, 'SIGTERM'],
    [false, null, 'SIGSEGV']
  ])('rejects incomplete or failed startup (ready=%s, code=%s, signal=%s)', async (ready, code, signal) => {
    const { child, pending } = startSmoke();
    if (ready) child.stdout.emit('data', 'PRISMGB_SMOKE_READY\n');
    child.emit('close', code, signal);
    expect((await pending).success).toBe(false);
  });

  it('fails and terminates a hung application even after readiness', async () => {
    const { child, pending, terminate } = startSmoke(10);
    child.stdout.emit('data', 'PRISMGB_SMOKE_READY\n');
    const result = await pending;
    expect(result.success).toBe(false);
    expect(result.reason).toContain('timed out');
    expect(terminate).toHaveBeenCalledWith(child, { killProcessGroup: true });
  });

  it('reports launch failures', async () => {
    const { child, pending } = startSmoke();
    child.emit('error', new Error('ENOENT'));
    expect(await pending).toMatchObject({ success: false, reason: 'Failed to start process: ENOENT' });
  });
});
