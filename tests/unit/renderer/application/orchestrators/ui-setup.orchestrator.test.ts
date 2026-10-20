import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UISetupOrchestrator } from '@renderer/application/orchestrators/ui-setup.orchestrator';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import { EventChannels } from '@renderer/lib/events/event-channels';
import { createInjectableHarness } from '../../../../support/di/injectable.harness.js';

vi.mock('@renderer/infrastructure/ipc/trpc-client', async () => ({
  trpcClient: (await import('../../../../support/mocks/trpc-client.mock')).createTrpcClientMock()
}));

describe('UISetupOrchestrator', () => {
  let orchestrator;
  let components;
  let eventBus;
  let streamingService;
  let mockLogger;

  const dispatch = (selector: string, type = 'click') => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true });
    document.querySelector(selector)?.dispatchEvent(event);
    return event;
  };

  beforeEach(() => {
    document.body.innerHTML = `
      <button data-ref="settingsBtn" data-action="settings.toggle"><span id="settingsIcon"></span></button>
      <button data-ref="shaderBtn" data-action="shader.toggle"></button>
      <button data-ref="notesBtn" data-action="notes.toggle"></button>
      <div id="streamOverlay" data-action="stream.start"></div>
      <video id="streamVideo" data-action="stream.stop"></video>
      <button id="screenshotBtn" data-action="capture.screenshot"></button>
      <button id="fullscreenBtn" data-action="fullscreen.toggle" title="Fullscreen"></button>
      <a href="#" id="linkGithub" data-action="external.github"></a>
      <button id="typo" data-action="settings.togle"></button>
    `;
    const h = createInjectableHarness(UISetupOrchestrator);
    orchestrator = h.subject;
    mockLogger = h.logger;
    ({ uiComponentHost: components, eventBus, streamingService } = h.deps);
    vi.spyOn(eventBus, 'publish');
    vi.mocked(trpcClient.shell.openExternal.mutate).mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await orchestrator.cleanup();
  });

  it('resolves the deferred components through the host', () => {
    orchestrator.initializeDeferredComponents();

    expect(components.resolveDeferred).toHaveBeenCalledTimes(1);
  });

  describe('delegated actions', () => {
    beforeEach(() => {
      orchestrator.setupUIEventListeners();
    });

    it.each([
      ['settingsBtn', 'settingsMenuComponent'],
      ['shaderBtn', 'shaderSelectorComponent'],
      ['notesBtn', 'notesPanelComponent']
    ])('toggles the component behind %s', (ref, componentId) => {
      dispatch(`[data-ref="${ref}"]`);

      expect(components.get(componentId).toggle).toHaveBeenCalledTimes(1);
    });

    it('finds the action on an ancestor of the click target and stops propagation for toggles', () => {
      const outerListener = vi.fn();
      document.addEventListener('click', outerListener);

      dispatch('#settingsIcon');

      expect(components.get('settingsMenuComponent').toggle).toHaveBeenCalledTimes(1);
      expect(outerListener).not.toHaveBeenCalled();
      document.removeEventListener('click', outerListener);
    });

    it('publishes stream start only while the overlay is visible', () => {
      document.querySelector('#streamOverlay')?.classList.add('hidden');
      dispatch('#streamOverlay');
      expect(eventBus.publish).not.toHaveBeenCalled();

      document.querySelector('#streamOverlay')?.classList.remove('hidden');
      dispatch('#streamOverlay');
      expect(eventBus.publish).toHaveBeenCalledWith(EventChannels.UI.STREAM_START_REQUESTED);
      expect(mockLogger.info).toHaveBeenCalledWith('Overlay clicked - requesting stream start');
    });

    it('publishes stream stop only while streaming', () => {
      dispatch('#streamVideo');
      expect(eventBus.publish).not.toHaveBeenCalled();

      streamingService.isStreaming = true;
      dispatch('#streamVideo');
      expect(eventBus.publish).toHaveBeenCalledWith(EventChannels.UI.STREAM_STOP_REQUESTED);
    });

    it('publishes the screenshot request', () => {
      dispatch('#screenshotBtn');

      expect(eventBus.publish).toHaveBeenCalledWith(EventChannels.UI.SCREENSHOT_REQUESTED);
    });

    it('clears the fullscreen title on mousedown and blurs the button when it publishes the toggle', () => {
      const button = document.querySelector<HTMLButtonElement>('#fullscreenBtn');
      const blur = vi.spyOn(button as HTMLButtonElement, 'blur');

      dispatch('#fullscreenBtn', 'mousedown');
      expect(button?.title).toBe('');
      expect(eventBus.publish).not.toHaveBeenCalled();

      dispatch('#fullscreenBtn');
      expect(blur).toHaveBeenCalledTimes(1);
      expect(eventBus.publish).toHaveBeenCalledWith(EventChannels.UI.FULLSCREEN_TOGGLE_REQUESTED);
    });

    it('opens external links through the shell and prevents navigation', () => {
      const event = dispatch('#linkGithub');

      expect(event.defaultPrevented).toBe(true);
      expect(trpcClient.shell.openExternal.mutate).toHaveBeenCalledWith({ url: 'https://github.com/josstei/prismgb-app' });
    });

    it('warns about unknown actions on click', () => {
      dispatch('#typo');

      expect(mockLogger.warn).toHaveBeenCalledWith('Unknown UI action: settings.togle');
    });

    it('binds the listeners only once', () => {
      orchestrator.setupUIEventListeners();
      dispatch('[data-ref="notesBtn"]');

      expect(components.get('notesPanelComponent').toggle).toHaveBeenCalledTimes(1);
    });
  });

  it('removes the delegated listeners on cleanup', async () => {
    orchestrator.setupUIEventListeners();
    await orchestrator.cleanup();
    expect(mockLogger.info).toHaveBeenCalledWith('Cleaning up UISetupOrchestrator...');

    dispatch('[data-ref="notesBtn"]');
    expect(components.get('notesPanelComponent').toggle).not.toHaveBeenCalled();
  });
});
