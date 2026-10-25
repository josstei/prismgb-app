
import { BaseOrchestrator } from '@platform/core';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import {
  getTemplateAction,
  getTemplateActionTarget
} from '@platform/ui-base';
import {
  UIActionDescriptors,
  UIActionEvents,
  isUIActionId,
  type UIActionControllerCommand,
  type UIActionDescriptor,
  type UIActionEvent
} from '@renderer/presentation/primitives/template-ref.utils.js';

import type { LoggerFactoryLike } from '@platform/core';
import type { TypedEventBusLike } from '@platform/events';
import type { UIController } from '@renderer/presentation/controller/ui.controller.js';
import { RendererTemplateDeferredComponentIds } from '@renderer/presentation/primitives/template-dom.contract.js';
import type { AppState } from '@renderer/application/state/app-state.js';

type UISetupController = Pick<UIController, 'initializeDeferredComponent' | 'toggleSettingsMenu' | 'toggleShaderSelector' | 'toggleNotesPanel'>;

type AppStateLike = Pick<AppState, 'isStreaming'>;

const UI_ACTION_LISTENERS_LIFECYCLE = Symbol('uiSetupActionListenersLifecycle');

type UISetupOrchestratorDependencies = {
  appState: AppStateLike;
  uiController: UISetupController;
  eventBus: TypedEventBusLike;
  loggerFactory: LoggerFactoryLike;
};

export class UISetupOrchestrator extends BaseOrchestrator {
  private _uiActionsBound: boolean;

  private readonly appState: AppStateLike;
  private readonly uiController: UISetupController;
  protected readonly eventBus: TypedEventBusLike;
  private readonly loggerFactory: LoggerFactoryLike;

  constructor({ appState, uiController, eventBus, loggerFactory }: UISetupOrchestratorDependencies) {
    super({ loggerFactory, eventBus }, 'UISetupOrchestrator');
    this.appState = appState;
    this.uiController = uiController;
    this.eventBus = eventBus;
    this.loggerFactory = loggerFactory;

    this._uiActionsBound = false;
  }

  initializeDeferredComponents(): void {
    RendererTemplateDeferredComponentIds.forEach((componentId) => {
      this.uiController.initializeDeferredComponent(componentId);
    });
  }

  setupUIEventListeners(): void {
    if (this._uiActionsBound) {
      return;
    }
    const actionRoot = this._getUiActionRoot();
    const listenerDisposers = UIActionEvents.map((eventName) =>
      this.listen(actionRoot, eventName, (event) =>
        this._executeDelegatedUiAction(eventName, event, actionRoot)
      )
    );
    this.replaceManaged(UI_ACTION_LISTENERS_LIFECYCLE, () => {
      listenerDisposers.splice(0).reverse().forEach((dispose) => dispose());
    });
    this._uiActionsBound = true;

    this.logger.info('UI event listeners set up');
  }

  private _getUiActionRoot(): (ParentNode & EventTarget) {
    return document.body || document;
  }

  private _executeDelegatedUiAction(eventName: UIActionEvent, event: Event, root: ParentNode): void {
    const actionTarget = getTemplateActionTarget(event, root);
    if (!actionTarget) {
      return;
    }

    const action = getTemplateAction(actionTarget);
    if (!isUIActionId(action)) {
      if (eventName === 'click' && action) {
        this.logger.warn(`Unknown UI action: ${action}`);
      }
      return;
    }

    const descriptors = UIActionDescriptors.filter(
      (descriptor) => descriptor.event === eventName && descriptor.action === action
    );
    for (const descriptor of descriptors) {
      this._executeUiAction(descriptor, event, actionTarget);
    }
  }

  private _executeUiAction(descriptor: UIActionDescriptor, event: Event, actionTarget: HTMLElement): void {
    if (!this._isUiActionEnabled(descriptor, actionTarget)) {
      return;
    }

    if (descriptor.stopPropagation) {
      event.stopPropagation();
    }

    if (descriptor.blurActionTarget) {
      actionTarget.blur();
    }

    if (descriptor.logMessage) {
      this.logger.info(descriptor.logMessage);
    }

    switch (descriptor.command.kind) {
      case 'publish':
        this.eventBus.publish(descriptor.command.channel);
        break;
      case 'controller':
        this._executeUiControllerAction(descriptor.command.method);
        break;
      case 'clear-title':
        this._clearActionTargetTitle(actionTarget);
        break;
      case 'external':
        this._openExternalUrl(event, descriptor.command.url);
        break;
    }
  }

  private _isUiActionEnabled(descriptor: UIActionDescriptor, actionTarget: HTMLElement): boolean {
    switch (descriptor.condition) {
      case 'overlay-visible':
        return !actionTarget.classList.contains(CSSClasses.HIDDEN);
      case 'streaming':
        return this.appState.isStreaming;
      default:
        return true;
    }
  }

  private _executeUiControllerAction(method: UIActionControllerCommand): void {
    switch (method) {
      case 'toggleSettingsMenu':
        this.uiController.toggleSettingsMenu();
        break;
      case 'toggleShaderSelector':
        this.uiController.toggleShaderSelector();
        break;
      case 'toggleNotesPanel':
        this.uiController.toggleNotesPanel();
        break;
    }
  }

  private _clearActionTargetTitle(actionTarget: HTMLElement): void {
    actionTarget.title = '';
  }

  private _openExternalUrl(event: Event, url: string): void {
    event.preventDefault();
    void trpcClient.shell.openExternal.mutate({ url }).catch(err => {
      this.logger.warn('Failed to open external URL:', err);
    });
  }

  async onCleanup(): Promise<void> {
    this.logger.info('Cleaning up UISetupOrchestrator...');
    await this.cancelManaged(UI_ACTION_LISTENERS_LIFECYCLE);
    this._uiActionsBound = false;
    this.logger.info('UISetupOrchestrator cleanup complete');
  }
}
