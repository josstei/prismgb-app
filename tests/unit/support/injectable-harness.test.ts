/**
 * Injectable Harness Unit Tests
 *
 * Verifies the DI-metadata-driven test harness: positional mock derivation from
 * @inject token metadata, override precedence, trailing-default tolerance,
 * mid-test reconstruction, and the pre-extracted logger idiom.
 */

import { describe, it, expect, vi } from 'vitest';
import { createInjectableHarness } from '../../support/di/injectable.harness.js';
import { SettingsDisplayModeOrchestrator } from '@renderer/application/orchestrators/display-mode.orchestrator';
import { RendererDeviceRuntime } from '@renderer/infrastructure/services/devices/device-runtime.service';

describe('createInjectableHarness', () => {
  it('constructs the subject with registry mocks in token order', () => {
    const h = createInjectableHarness(SettingsDisplayModeOrchestrator);

    expect(h.subject).toBeInstanceOf(SettingsDisplayModeOrchestrator);
    expect(h.deps.fullscreenService).toBeDefined();
    expect(h.deps.cinematicModeService).toBeDefined();
    expect(h.deps.settingsService).toBeDefined();
    expect(h.deps.eventBus).toBeDefined();
    expect(h.deps.loggerFactory).toBeDefined();
  });

  it('wires each positional dependency onto the subject', () => {
    const h = createInjectableHarness(SettingsDisplayModeOrchestrator);
    const subject = h.subject as unknown as Record<string, unknown>;

    expect(subject.fullscreenService).toBe(h.deps.fullscreenService);
    expect(subject.cinematicModeService).toBe(h.deps.cinematicModeService);
    expect(subject.settingsService).toBe(h.deps.settingsService);
  });

  it('prefers overrides over registry factories', () => {
    const settingsService = { getBooleanSetting: vi.fn().mockReturnValue(true) };
    const h = createInjectableHarness(SettingsDisplayModeOrchestrator, {
      overrides: { settingsService }
    });

    expect(h.deps.settingsService).toBe(settingsService);
  });

  it('tolerates trailing non-token defaulted constructor parameters', () => {
    const h = createInjectableHarness(RendererDeviceRuntime, {
      overrides: {
        deviceStatusPort: { subscribe: vi.fn(() => () => {}), query: vi.fn() },
        mediaDevicesPort: { enumerateVideoInputs: vi.fn().mockResolvedValue([]) },
        devicePreferenceStore: { load: vi.fn(() => null), save: vi.fn() }
      }
    });

    expect(h.subject).toBeInstanceOf(RendererDeviceRuntime);
  });

  it('exposes the logger the subject was constructed with', () => {
    const h = createInjectableHarness(SettingsDisplayModeOrchestrator);
    const subject = h.subject as unknown as { logger: unknown };

    expect(h.logger).toBe(subject.logger);
    expect(h.logger.info).toBeDefined();
  });

  it('reconstructs the subject mid-test preserving undisturbed deps', () => {
    const h = createInjectableHarness(SettingsDisplayModeOrchestrator);
    const originalEventBus = h.deps.eventBus;
    const fullscreenService = {
      initialize: vi.fn(),
      enterFullscreen: vi.fn(),
      dispose: vi.fn()
    };

    const rebuilt = h.recreate({ fullscreenService });

    expect(rebuilt).toBe(h.subject);
    expect(h.deps.fullscreenService).toBe(fullscreenService);
    expect(h.deps.eventBus).toBe(originalEventBus);
    expect((h.subject as unknown as Record<string, unknown>).fullscreenService).toBe(fullscreenService);
  });

  it('throws a descriptive error for tokens without factory or override', () => {
    expect(() => createInjectableHarness(RendererDeviceRuntime)).toThrow(/deviceStatusPort/);
    expect(() => createInjectableHarness(RendererDeviceRuntime)).toThrow(/RendererDeviceRuntime/);
  });
});
