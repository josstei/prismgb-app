import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { evaluateStartupChunk, runDevBootSmoke } from '../../../scripts/dev-boot-smoke.js';

class FakeChildProcess extends EventEmitter {
  constructor() {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.pid = 9876;
  }

  kill() {
    return true;
  }
}

describe('dev-boot smoke log evaluator', () => {
  it('passes when renderer startup success marker is logged', () => {
    const result = evaluateStartupChunk('[INFO] Renderer application started successfully');
    expect(result).toMatchObject({ status: 'success', reason: 'Renderer started' });
  });

  it('fails when renderer error output appears', () => {
    const result = evaluateStartupChunk('[Renderer ERROR] Failed to initialize service');
    expect(result).toMatchObject({
      status: 'failure',
      reason: 'Renderer error log output',
      matchedPattern: 'renderer-error'
    });
  });

  it('fails when an Awilix resolution error appears', () => {
    const result = evaluateStartupChunk(
      'Error: Could not resolve "missingToken" for service "appOrchestrator".'
    );
    expect(result).toMatchObject({
      status: 'failure',
      reason: 'Awilix token resolution failure',
      matchedPattern: 'awilix-resolution'
    });
  });

  it('fails when Vite JSON import-attribute warnings appear', () => {
    const result = evaluateStartupChunk(
      'Warning: [plugin: vite:import-analysis] import-attribute warning: use import attributes for JSON modules'
    );
    expect(result).toMatchObject({
      status: 'failure',
      reason: 'Vite JSON import-attribute warning',
      matchedPattern: 'vite-json-import-attribute'
    });
  });

  it('continues on unrelated log output', () => {
    const result = evaluateStartupChunk('Vite dev server ready at http://localhost:3000');
    expect(result).toMatchObject({ status: 'continue' });
  });

  it('resolves as success when mocked dev process emits success marker', async () => {
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const fake = new FakeChildProcess();
    const spawn = vi.fn(() => fake);

    const runPromise = runDevBootSmoke({
      spawn,
      timeoutMs: 200,
      gracefulShutdownMs: 10
    });

    fake.stdout.emit('data', Buffer.from('Renderer application started successfully'));
    const result = await runPromise;

    expect(spawn).toHaveBeenCalledWith(
      'npm',
      ['run', 'dev'],
      expect.objectContaining({
        cwd: process.cwd(),
        detached: process.platform !== 'win32'
      })
    );
    expect(result.success).toBe(true);
    expect(result.reason).toBe('Renderer started');
    killSpy.mockRestore();
  });

  it('evaluates buffered stdout so split success markers are detected', async () => {
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const fake = new FakeChildProcess();
    const spawn = vi.fn(() => fake);

    const runPromise = runDevBootSmoke({
      spawn,
      timeoutMs: 200,
      gracefulShutdownMs: 10
    });

    fake.stdout.emit('data', Buffer.from('Renderer application started'));
    fake.stdout.emit('data', Buffer.from(' successfully'));
    const result = await runPromise;

    expect(result.success).toBe(true);
    expect(result.reason).toBe('Renderer started');
    killSpy.mockRestore();
  });

  it('evaluates buffered stderr so split failure markers are detected', async () => {
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const fake = new FakeChildProcess();
    const spawn = vi.fn(() => fake);

    const runPromise = runDevBootSmoke({
      spawn,
      timeoutMs: 200,
      gracefulShutdownMs: 10
    });

    fake.stderr.emit('data', Buffer.from('[Renderer '));
    fake.stderr.emit('data', Buffer.from('ERROR] Failed to initialize'));
    const result = await runPromise;

    expect(result.success).toBe(false);
    expect(result.reason).toBe('Renderer error log output');
    expect(result.matchedPattern).toBe('renderer-error');
    killSpy.mockRestore();
  });
});
