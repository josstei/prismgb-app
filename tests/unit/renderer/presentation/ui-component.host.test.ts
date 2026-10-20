import { describe, it, expect, vi } from 'vitest';
import { TOKENS } from '@renderer/application/di/tokens';
import {
  CORE_COMPONENT_IDS,
  DEFERRED_COMPONENT_IDS,
  UiComponentHost
} from '@renderer/presentation/ui-component.host';
import { createLoggerFactory } from '../../../factories/index.js';

type ComponentStub = { id: string; dispose: ReturnType<typeof vi.fn> };

const idByToken = new Map<unknown, string>(
  [...CORE_COMPONENT_IDS, ...DEFERRED_COMPONENT_IDS].map((id) => [TOKENS[id], id])
);

function createHost(createComponent: (id: string) => ComponentStub = (id) => ({ id, dispose: vi.fn() })) {
  const loggerFactory = createLoggerFactory();
  const resolve = vi.fn((token: unknown) => createComponent(idByToken.get(token) ?? 'unknown'));
  const host = new UiComponentHost(resolve as never, loggerFactory);
  return { host, resolve, logger: loggerFactory.create('UiComponentHost') };
}

const resolvedIds = (resolve: ReturnType<typeof vi.fn>) => resolve.mock.results.map(({ value }) => value.id);

describe('UiComponentHost', () => {
  it('resolves a component through its token only when first accessed', () => {
    const { host, resolve } = createHost();

    expect(resolve).not.toHaveBeenCalled();

    host.get('notesPanelComponent');

    expect(resolve).toHaveBeenCalledWith(TOKENS.notesPanelComponent);
  });

  it('caches the resolved instance across repeated access', () => {
    const { host, resolve } = createHost();

    const first = host.get('settingsMenuComponent');
    const second = host.get('settingsMenuComponent');

    expect(second).toBe(first);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('resolveCore resolves exactly the core components in order', () => {
    const { host, resolve } = createHost();

    host.resolveCore();

    expect(resolvedIds(resolve)).toEqual([
      'statusNotificationComponent',
      'deviceStatusComponent',
      'streamingControlsComponent',
      'transcodeProgressComponent'
    ]);
  });

  it('resolveDeferred resolves exactly the deferred components in order', () => {
    const { host, resolve } = createHost();

    host.resolveDeferred();

    expect(resolvedIds(resolve)).toEqual(['settingsMenuComponent', 'shaderSelectorComponent', 'notesPanelComponent']);
  });

  it('does not re-resolve components that were already accessed', () => {
    const { host, resolve } = createHost();

    host.get('shaderSelectorComponent');
    host.resolveDeferred();

    expect(resolvedIds(resolve)).toEqual(['shaderSelectorComponent', 'settingsMenuComponent', 'notesPanelComponent']);
  });

  it('disposes resolved components in reverse resolution order', async () => {
    const disposeOrder: string[] = [];
    const { host } = createHost((id) => ({ id, dispose: vi.fn(() => { disposeOrder.push(id); }) }));

    host.get('shaderSelectorComponent');
    host.resolveCore();
    await host.dispose();

    expect(disposeOrder).toEqual([
      'transcodeProgressComponent',
      'streamingControlsComponent',
      'deviceStatusComponent',
      'statusNotificationComponent',
      'shaderSelectorComponent'
    ]);
  });

  it('logs a dispose error and still disposes the remaining components', async () => {
    const error = new Error('boom');
    const components = new Map<string, ComponentStub>();
    const { host, logger } = createHost((id) => {
      const component = {
        id,
        dispose: vi.fn(() => {
          if (id === 'notesPanelComponent') throw error;
        })
      };
      components.set(id, component);
      return component;
    });

    host.get('settingsMenuComponent');
    host.get('notesPanelComponent');

    await expect(host.dispose()).resolves.toBeUndefined();
    expect(components.get('settingsMenuComponent')?.dispose).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('Error disposing component: notesPanelComponent', error);
  });

  it('forgets disposed components so the next access resolves again', async () => {
    const { host, resolve } = createHost();

    host.get('notesPanelComponent');
    await host.dispose();
    host.get('notesPanelComponent');

    expect(resolve).toHaveBeenCalledTimes(2);
  });
});
