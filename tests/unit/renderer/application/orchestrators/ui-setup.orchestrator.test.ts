import { describe, it, expect, beforeEach } from 'vitest';
import { UISetupOrchestrator } from '@renderer/application/orchestrators/ui-setup.orchestrator';
import { createInjectableHarness } from '../../../../support/di/injectable.harness.js';

describe('UISetupOrchestrator', () => {
  let orchestrator;
  let components;
  let mockLogger;

  const click = (element: HTMLElement) => element.dispatchEvent(new MouseEvent('click', { bubbles: true }));

  beforeEach(() => {
    document.body.innerHTML = `
      <button data-ref="settingsBtn" data-action="settings.toggle"></button>
      <button data-ref="shaderBtn" data-action="shader.toggle"></button>
      <button data-ref="notesBtn" data-action="notes.toggle"></button>
    `;
    const h = createInjectableHarness(UISetupOrchestrator);
    orchestrator = h.subject;
    mockLogger = h.logger;
    ({ uiComponentHost: components } = h.deps);
  });

  describe('initializeDeferredComponents', () => {
    it('resolves every deferred component through the host', () => {
      orchestrator.initializeDeferredComponents();

      expect(components.get.mock.calls.map(([id]) => id)).toEqual([
        'settingsMenuComponent',
        'shaderSelectorComponent',
        'notesPanelComponent'
      ]);
    });
  });

  describe('component toggles', () => {
    beforeEach(() => {
      orchestrator.setupUIEventListeners();
    });

    it.each([
      ['settingsBtn', 'settingsMenuComponent'],
      ['shaderBtn', 'shaderSelectorComponent'],
      ['notesBtn', 'notesPanelComponent']
    ])('toggles the component behind %s', (ref, componentId) => {
      click(document.querySelector(`[data-ref="${ref}"]`) as HTMLElement);

      expect(components.get(componentId).toggle).toHaveBeenCalledTimes(1);
    });
  });

  describe('setupUIEventListeners and cleanup', () => {
    it('should set up and clean up event listeners', async () => {
      orchestrator.setupUIEventListeners();
      await orchestrator.cleanup();
      expect(mockLogger.info).toHaveBeenCalledWith('Cleaning up UISetupOrchestrator...');

      click(document.querySelector('[data-ref="notesBtn"]') as HTMLElement);
      expect(components.get('notesPanelComponent').toggle).not.toHaveBeenCalled();
    });
  });
});
