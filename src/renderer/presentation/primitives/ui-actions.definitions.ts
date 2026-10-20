import { EventChannels } from '@renderer/lib/events/event-channels';
import type { DeferredComponentId } from '@renderer/presentation/ui-component.host';

const ACTION_ATTRIBUTE = 'data-action';

export type UIActionEvent = 'click' | 'mousedown';

type UIActionPublishChannel =
  | typeof EventChannels.UI.STREAM_START_REQUESTED
  | typeof EventChannels.UI.STREAM_STOP_REQUESTED
  | typeof EventChannels.UI.SCREENSHOT_REQUESTED
  | typeof EventChannels.UI.RECORDING_TOGGLE_REQUESTED
  | typeof EventChannels.UI.FULLSCREEN_TOGGLE_REQUESTED;

type UIActionCommand =
  | { kind: 'publish'; channel: UIActionPublishChannel }
  | { kind: 'toggle'; component: DeferredComponentId }
  | { kind: 'clear-title' }
  | { kind: 'external'; url: string };

export interface UIActionDescriptor {
  action: string;
  event: UIActionEvent;
  command: UIActionCommand;
  condition?: 'overlay-visible' | 'streaming';
  logMessage?: string;
  stopPropagation?: boolean;
  blurActionTarget?: boolean;
}

export const UIActionEvents = ['click', 'mousedown'] as const satisfies readonly UIActionEvent[];

export const UIActionDescriptors = [
  { action: 'stream.start', event: 'click', command: { kind: 'publish', channel: EventChannels.UI.STREAM_START_REQUESTED }, condition: 'overlay-visible', logMessage: 'Overlay clicked - requesting stream start' },
  { action: 'stream.stop', event: 'click', command: { kind: 'publish', channel: EventChannels.UI.STREAM_STOP_REQUESTED }, condition: 'streaming', logMessage: 'Stream clicked - requesting stream stop' },
  { action: 'capture.screenshot', event: 'click', command: { kind: 'publish', channel: EventChannels.UI.SCREENSHOT_REQUESTED } },
  { action: 'recording.toggle', event: 'click', command: { kind: 'publish', channel: EventChannels.UI.RECORDING_TOGGLE_REQUESTED } },
  { action: 'fullscreen.toggle', event: 'click', command: { kind: 'publish', channel: EventChannels.UI.FULLSCREEN_TOGGLE_REQUESTED }, blurActionTarget: true },
  { action: 'fullscreen.toggle', event: 'mousedown', command: { kind: 'clear-title' } },
  { action: 'settings.toggle', event: 'click', command: { kind: 'toggle', component: 'settingsMenuComponent' }, stopPropagation: true },
  { action: 'shader.toggle', event: 'click', command: { kind: 'toggle', component: 'shaderSelectorComponent' }, stopPropagation: true },
  { action: 'notes.toggle', event: 'click', command: { kind: 'toggle', component: 'notesPanelComponent' } },
  { action: 'external.github', event: 'click', command: { kind: 'external', url: 'https://github.com/josstei/prismgb-app' } },
  { action: 'external.website', event: 'click', command: { kind: 'external', url: 'https://prismgb.com' } },
  { action: 'external.x', event: 'click', command: { kind: 'external', url: 'https://x.com/prism_gb' } },
  { action: 'external.kofi', event: 'click', command: { kind: 'external', url: 'https://ko-fi.com/josstei' } },
  { action: 'external.modretro', event: 'click', command: { kind: 'external', url: 'https://modretro.com' } }
] as const satisfies readonly UIActionDescriptor[];

export type UIActionId = (typeof UIActionDescriptors)[number]['action'];

const UIActionIdSet: ReadonlySet<string> = new Set(UIActionDescriptors.map(({ action }) => action));

export function isUIActionId(action: string | null): action is UIActionId {
  return !!action && UIActionIdSet.has(action);
}

/** The closest [data-action] element around the event target, if it lies inside root. */
export function findActionTarget(event: Event, root: Node): HTMLElement | null {
  const target = event.target instanceof Element ? event.target : null;
  const actionTarget = target?.closest<HTMLElement>(`[${ACTION_ATTRIBUTE}]`) ?? null;
  return actionTarget && root.contains(actionTarget) ? actionTarget : null;
}

export function getAction(element: Element): string | null {
  return element.getAttribute(ACTION_ATTRIBUTE) || null;
}
