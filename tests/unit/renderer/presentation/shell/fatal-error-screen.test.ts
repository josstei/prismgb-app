import { describe, it, expect, beforeEach } from 'vitest';
import { renderFatalError } from '@renderer/presentation/shell/fatal-error-screen';

describe('renderFatalError', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="x"></div>'; });

  it('replaces body content with the error heading, message, and stack', () => {
    const err = new Error('boom');
    err.stack = 'STACKTRACE';
    renderFatalError(err);
    expect(document.querySelector('h2')?.textContent).toBe('Failed to initialize application');
    expect(document.querySelector('p')?.textContent).toBe('boom');
    expect(document.querySelector('pre')?.textContent).toBe('STACKTRACE');
    expect(document.getElementById('x')).toBeNull(); // previous content cleared
  });
});
