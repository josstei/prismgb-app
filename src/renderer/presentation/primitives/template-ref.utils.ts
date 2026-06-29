import { EventChannels } from '@prismgb/events';
import { TemplateActionTargets } from '@renderer/presentation/primitives/template-dom.contract.js';
import {
  TEMPLATE_REF_ATTRIBUTE,
  TEMPLATE_ACTION_ATTRIBUTE,
  createTemplateRefSelector,
  createTemplateActionSelector,
  getTemplateAction,
  getTemplateActionTarget,
  bindTemplateRefs
} from '@prismgb/ui-base';
import type {
  TemplateRefList,
  TemplateRefLegacyIdMap,
  TemplateRefBindingOptions
} from '@prismgb/ui-base';

export {
  TEMPLATE_REF_ATTRIBUTE,
  TEMPLATE_ACTION_ATTRIBUTE,
  createTemplateRefSelector,
  createTemplateActionSelector,
  getTemplateAction,
  getTemplateActionTarget,
  bindTemplateRefs
};
export type {
  TemplateRefList,
  TemplateRefLegacyIdMap,
  TemplateRefBindingOptions
};

export const UIActionIds = {
  SCREENSHOT_CAPTURE: 'capture.screenshot',
  RECORDING_TOGGLE: 'recording.toggle',
  FULLSCREEN_TOGGLE: 'fullscreen.toggle',
  SETTINGS_TOGGLE: 'settings.toggle',
  SHADER_TOGGLE: 'shader.toggle',
  NOTES_TOGGLE: 'notes.toggle',
  STREAM_START: 'stream.start',
  STREAM_STOP: 'stream.stop',
  EXTERNAL_GITHUB: 'external.github',
  EXTERNAL_WEBSITE: 'external.website',
  EXTERNAL_X: 'external.x',
  EXTERNAL_KOFI: 'external.kofi',
  EXTERNAL_MODRETRO: 'external.modretro'
} as const;

export type UIActionId = typeof UIActionIds[keyof typeof UIActionIds];
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
  action: UIActionId;
  event: UIActionEvent;
  command: UIActionCommand;
  condition?: UIActionCondition;
  logMessage?: string;
  stopPropagation?: boolean;
  blurActionTarget?: boolean;
}

export interface UIActionTargetDescriptor {
  action: UIActionId;
  ref: string;
  events: readonly UIActionEvent[];
}

const UIActionIdSet: ReadonlySet<string> = new Set(Object.values(UIActionIds));

export const UIActionEvents = ['click', 'mousedown'] as const satisfies readonly UIActionEvent[];

export const UIActionDescriptors = [
  { action: UIActionIds.STREAM_START, event: 'click', command: { kind: 'publish', channel: EventChannels.UI.STREAM_START_REQUESTED }, condition: 'overlay-visible', logMessage: 'Overlay clicked - requesting stream start' },
  { action: UIActionIds.STREAM_STOP, event: 'click', command: { kind: 'publish', channel: EventChannels.UI.STREAM_STOP_REQUESTED }, condition: 'streaming', logMessage: 'Stream clicked - requesting stream stop' },
  { action: UIActionIds.SCREENSHOT_CAPTURE, event: 'click', command: { kind: 'publish', channel: EventChannels.UI.SCREENSHOT_REQUESTED } },
  { action: UIActionIds.RECORDING_TOGGLE, event: 'click', command: { kind: 'publish', channel: EventChannels.UI.RECORDING_TOGGLE_REQUESTED } },
  { action: UIActionIds.FULLSCREEN_TOGGLE, event: 'click', command: { kind: 'publish', channel: EventChannels.UI.FULLSCREEN_TOGGLE_REQUESTED }, blurActionTarget: true },
  { action: UIActionIds.FULLSCREEN_TOGGLE, event: 'mousedown', command: { kind: 'clear-title' } },
  { action: UIActionIds.SETTINGS_TOGGLE, event: 'click', command: { kind: 'controller', method: 'toggleSettingsMenu' }, stopPropagation: true },
  { action: UIActionIds.SHADER_TOGGLE, event: 'click', command: { kind: 'controller', method: 'toggleShaderSelector' }, stopPropagation: true },
  { action: UIActionIds.NOTES_TOGGLE, event: 'click', command: { kind: 'controller', method: 'toggleNotesPanel' } },
  { action: UIActionIds.EXTERNAL_GITHUB, event: 'click', command: { kind: 'external', url: 'https://github.com/josstei/prismgb-app' } },
  { action: UIActionIds.EXTERNAL_WEBSITE, event: 'click', command: { kind: 'external', url: 'https://prismgb.com' } },
  { action: UIActionIds.EXTERNAL_X, event: 'click', command: { kind: 'external', url: 'https://x.com/prism_gb' } },
  { action: UIActionIds.EXTERNAL_KOFI, event: 'click', command: { kind: 'external', url: 'https://ko-fi.com/josstei' } },
  { action: UIActionIds.EXTERNAL_MODRETRO, event: 'click', command: { kind: 'external', url: 'https://modretro.com' } }
] as const satisfies readonly UIActionDescriptor[];

export const UIActionTargets = TemplateActionTargets.map(({ action, events, ref }) => ({
  action,
  ref,
  events
})) satisfies readonly UIActionTargetDescriptor[];

export function isUIActionId(action: string | null): action is UIActionId {
  return !!action && UIActionIdSet.has(action);
}
