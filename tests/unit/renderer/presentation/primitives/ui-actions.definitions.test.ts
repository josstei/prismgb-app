import { describe, it, expect } from 'vitest';
import {
  UIActionDescriptors,
  findActionTarget,
  getAction,
  isUIActionId
} from '@renderer/presentation/primitives/ui-actions.definitions';

// Template sources are scanned raw: the header and stream viewer import public `?url` assets
// that only the app's Vite config can resolve.
const templateSources = import.meta.glob<string>('/src/renderer/presentation/**/*.template.ts', {
  query: '?raw',
  import: 'default',
  eager: true
});

function templateActions(): string[] {
  return Object.values(templateSources).flatMap((source) =>
    [...source.matchAll(/data-action="([^"]*)"/g)].map(([, action]) => action)
  );
}

describe('UI action definitions', () => {
  it('declares every data-action the templates render', () => {
    const actions = templateActions();
    const unknown = actions.filter((action) => !isUIActionId(action));

    expect(actions.length).toBeGreaterThan(0);
    expect(unknown).toEqual([]);
  });

  it('renders every declared action in some template', () => {
    const rendered = new Set(templateActions());
    const unrendered = UIActionDescriptors.map(({ action }) => action).filter((action) => !rendered.has(action));

    expect(unrendered).toEqual([]);
  });

  it('rejects null and unknown action ids', () => {
    expect(isUIActionId(null)).toBe(false);
    expect(isUIActionId('settings.togle')).toBe(false);
    expect(isUIActionId('settings.toggle')).toBe(true);
  });

  describe('findActionTarget', () => {
    it('returns the closest [data-action] ancestor inside the root', () => {
      document.body.innerHTML = '<div id="root"><button data-action="notes.toggle"><span id="icon"></span></button></div>';
      const event = new MouseEvent('click');
      Object.defineProperty(event, 'target', { value: document.getElementById('icon') });

      const target = findActionTarget(event, document.getElementById('root') as HTMLElement);

      expect(target?.tagName).toBe('BUTTON');
      expect(target && getAction(target)).toBe('notes.toggle');
    });

    it('ignores action elements outside the root and non-element targets', () => {
      document.body.innerHTML = '<button id="outside" data-action="notes.toggle"></button><div id="root"></div>';
      const outside = new MouseEvent('click');
      Object.defineProperty(outside, 'target', { value: document.getElementById('outside') });
      const textTarget = new MouseEvent('click');
      Object.defineProperty(textTarget, 'target', { value: document.createTextNode('x') });

      expect(findActionTarget(outside, document.getElementById('root') as HTMLElement)).toBeNull();
      expect(findActionTarget(textTarget, document.body)).toBeNull();
    });
  });

  it('reads an empty data-action as no action', () => {
    const element = document.createElement('button');
    element.setAttribute('data-action', '');

    expect(getAction(element)).toBeNull();
  });
});
