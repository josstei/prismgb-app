/**
 * AnimationPerformanceOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AnimationPerformanceOrchestrator } from '@app/renderer/application/performance/animation-performance.orchestrator.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

describe('AnimationPerformanceOrchestrator', () => {
  let orchestrator;
  let mockEventBus;
  let mockLogger;
  let handlers;

  beforeEach(() => {
    handlers = {};
    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn((channel, handler) => {
        handlers[channel] = handler;
        return vi.fn();
      })
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    Object.defineProperty(document, 'hidden', {
      value: false,
      writable: true,
      configurable: true
    });

    orchestrator = new AnimationPerformanceOrchestrator({
      eventBus: mockEventBus,
      loggerFactory: { create: vi.fn(() => mockLogger) }
    });
  });

  afterEach(() => {
    document.body.className = '';
    vi.restoreAllMocks();
  });

  it('should suppress animations when performance mode and weak GPU are enabled', async () => {
    await orchestrator.onInitialize();

    handlers[EventChannels.PERFORMANCE.UI_MODE_CHANGED]({
      enabled: true,
      weakGpuDetected: true
    });

    expect(document.body.classList.contains('app-animations-off')).toBe(true);
  });

  it('should clear suppression when performance mode is disabled', async () => {
    await orchestrator.onInitialize();

    handlers[EventChannels.PERFORMANCE.UI_MODE_CHANGED]({
      enabled: true,
      weakGpuDetected: false
    });
    handlers[EventChannels.PERFORMANCE.UI_MODE_CHANGED]({
      enabled: false,
      weakGpuDetected: false
    });

    expect(document.body.classList.contains('app-animations-off')).toBe(false);
  });

  it('should add streaming class when stream starts', async () => {
    await orchestrator.onInitialize();

    handlers[EventChannels.STREAM.STARTED]();

    expect(document.body.classList.contains('app-streaming')).toBe(true);
  });
});
