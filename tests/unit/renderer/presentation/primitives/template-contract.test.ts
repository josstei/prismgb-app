import { describe, expect, it } from 'vitest';
import { createAppShellTemplate } from '@renderer/presentation/shell/app-shell.template.js';
import { TemplateDomRefGroups } from '@renderer/presentation/primitives/template-dom.contract.js';
import { UIActionDescriptors, isUIActionId } from '@renderer/presentation/primitives/template-ref.utils.js';

describe('rendered template contract', () => {
  it('provides exactly one element for each required binding and a target for every action', () => {
    const root = document.createElement('div');
    root.innerHTML = createAppShellTemplate();
    for (const ref of Object.values(TemplateDomRefGroups).flat()) {
      expect(root.querySelectorAll(`[data-ref="${ref}"]`), ref).toHaveLength(1);
    }
    const actions = [...root.querySelectorAll('[data-action]')].map((element) => element.getAttribute('data-action'));
    expect(actions.every(isUIActionId)).toBe(true);
    expect(new Set(actions)).toEqual(new Set(UIActionDescriptors.map(({ action }) => action)));
    expect(root.querySelector('#fullscreenBtn')?.getAttribute('aria-label')).toBe('Toggle Fullscreen');
    expect(root.querySelector('#notesBtn')?.getAttribute('aria-expanded')).toBe('false');
  });
});
