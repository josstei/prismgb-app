import { EventChannels } from '@platform/events';

export type UIActionEvent = 'click' | 'mousedown';
export type UIActionControllerCommand = 'toggleSettingsMenu' | 'toggleShaderSelector' | 'toggleNotesPanel';
export type UIActionPublishChannel =
  | typeof EventChannels.UI.STREAM_START_REQUESTED
  | typeof EventChannels.UI.STREAM_STOP_REQUESTED
  | typeof EventChannels.UI.SCREENSHOT_REQUESTED
  | typeof EventChannels.UI.RECORDING_TOGGLE_REQUESTED
  | typeof EventChannels.UI.FULLSCREEN_TOGGLE_REQUESTED;

export type UIActionCommand =
  | { kind: 'publish'; channel: UIActionPublishChannel }
  | { kind: 'controller'; method: UIActionControllerCommand }
  | { kind: 'clear-title' }
  | { kind: 'external'; url: string };

export type UIActionCondition = 'overlay-visible' | 'streaming';

export interface UIActionDescriptor {
  action: string;
  event: UIActionEvent;
  command: UIActionCommand;
  condition?: UIActionCondition;
  logMessage?: string;
  stopPropagation?: boolean;
  blurActionTarget?: boolean;
}

export const UIActionDescriptors = [
  { action: 'stream.start', event: 'click', command: { kind: 'publish', channel: EventChannels.UI.STREAM_START_REQUESTED }, condition: 'overlay-visible', logMessage: 'Overlay clicked - requesting stream start' },
  { action: 'stream.stop', event: 'click', command: { kind: 'publish', channel: EventChannels.UI.STREAM_STOP_REQUESTED }, condition: 'streaming', logMessage: 'Stream clicked - requesting stream stop' },
  { action: 'capture.screenshot', event: 'click', command: { kind: 'publish', channel: EventChannels.UI.SCREENSHOT_REQUESTED } },
  { action: 'recording.toggle', event: 'click', command: { kind: 'publish', channel: EventChannels.UI.RECORDING_TOGGLE_REQUESTED } },
  { action: 'fullscreen.toggle', event: 'click', command: { kind: 'publish', channel: EventChannels.UI.FULLSCREEN_TOGGLE_REQUESTED }, blurActionTarget: true },
  { action: 'fullscreen.toggle', event: 'mousedown', command: { kind: 'clear-title' } },
  { action: 'settings.toggle', event: 'click', command: { kind: 'controller', method: 'toggleSettingsMenu' }, stopPropagation: true },
  { action: 'shader.toggle', event: 'click', command: { kind: 'controller', method: 'toggleShaderSelector' }, stopPropagation: true },
  { action: 'notes.toggle', event: 'click', command: { kind: 'controller', method: 'toggleNotesPanel' } },
  { action: 'external.github', event: 'click', command: { kind: 'external', url: 'https://github.com/josstei/prismgb-app' } },
  { action: 'external.website', event: 'click', command: { kind: 'external', url: 'https://prismgb.com' } },
  { action: 'external.x', event: 'click', command: { kind: 'external', url: 'https://x.com/prism_gb' } },
  { action: 'external.kofi', event: 'click', command: { kind: 'external', url: 'https://ko-fi.com/josstei' } },
  { action: 'external.modretro', event: 'click', command: { kind: 'external', url: 'https://modretro.com' } }
] as const satisfies readonly UIActionDescriptor[];

export type UIActionId = typeof UIActionDescriptors[number]['action'];
const UIActionIdSet: ReadonlySet<string> = new Set(UIActionDescriptors.map(({ action }) => action));
export const UIActionEvents: readonly UIActionEvent[] = [...new Set(UIActionDescriptors.map(({ event }) => event))];

/** Templates use this typed attribute so action names cannot drift from dispatch. */
export function actionAttribute(action: UIActionId): string {
  return `data-action="${action}"`;
}

export function isUIActionId(action: string | null): action is UIActionId {
  return !!action && UIActionIdSet.has(action);
}
