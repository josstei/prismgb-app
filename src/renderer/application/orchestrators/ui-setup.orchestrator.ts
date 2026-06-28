import { Service } from '@prismgb/core';
import { BaseOrchestrator } from '@prismgb/core';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import {
  UIActionDescriptors,
  UIActionEvents,
  UIActionTargets,
  createTemplateRefSelector,
  getTemplateAction,
  getTemplateActionTarget,
  isUIActionId,
  type UIActionControllerCommand,
  type UIActionDescriptor,
  type UIActionEvent
} from '@renderer/presentation/primitives/template-ref.utils.js';
import type { LoggerFactoryLike } from '@prismgb/core';
import type { TypedEventBusLike } from '@prismgb/events';
import type { SettingsService } from '@renderer/infrastructure/services/settings/settings.service';
import type { NotesService } from '@prismgb/notes';
import type { UpdateOrchestrator } from '@renderer/application/orchestrators/update.orchestrator';
import type { UIController } from '@renderer/presentation/controller/ui.controller.js';
import { RendererTemplateDeferredComponentIds, type RendererTemplateDeferredComponentId } from '@renderer/presentation/primitives/template-dom.contract.js';
import type { RendererUiComponentDependencies } from '@renderer/presentation/controller/ui-component.catalog.js';

type AppStateLike = {
  readonly isStreaming: boolean;
  readonly isCinematicModeEnabled?: boolean;
};

type UISetupOrchestratorDependencies = {
  appState: AppStateLike;
  updateOrchestrator: UpdateOrchestrator;
  settingsService: SettingsService;
  notesService: NotesService;
  uiController: UIController;
  eventBus: TypedEventBusLike;
  loggerFactory: LoggerFactoryLike;
};

type DeferredComponentDependencies = {
  [TId in RendererTemplateDeferredComponentId]: RendererUiComponentDependencies<TId>;
};

const UI_ACTION_LISTENERS_LIFECYCLE = Symbol('uiSetupActionListenersLifecycle');

@Service({
  "token": "uiSetupOrchestrator",
  "dependencies": [
    "appState",
    "updateOrchestrator",
    "settingsService",
    "notesService",
    "uiController",
    "eventBus",
    "loggerFactory"
  ]
})
export class UISetupOrchestrator extends BaseOrchestrator {
  protected readonly eventBus: TypedEventBusLike;
  private readonly appState: AppStateLike;
  private readonly updateOrchestrator: UpdateOrchestrator;
  private readonly settingsService: SettingsService;
  private readonly notesService: NotesService;
  private readonly uiController: UIController;
  private readonly loggerFactory: LoggerFactoryLike;
  private _uiActionsBound: boolean;

  constructor(dependencies: UISetupOrchestratorDependencies) {
    super(
      dependencies,
      'UISetupOrchestrator'
    );

    this.appState = dependencies.appState;
    this.updateOrchestrator = dependencies.updateOrchestrator;
    this.settingsService = dependencies.settingsService;
    this.notesService = dependencies.notesService;
    this.uiController = dependencies.uiController;
    this.eventBus = dependencies.eventBus;
    this.loggerFactory = dependencies.loggerFactory;
    this._uiActionsBound = false;
  }

  initializeDeferredComponents(): void {
    const dependenciesByComponent = this._createDeferredComponentDependencies();
    RendererTemplateDeferredComponentIds.forEach((componentId) => {
      this.uiController.initializeDeferredComponent(componentId, dependenciesByComponent[componentId]);
    });
  }

  private _createDeferredComponentDependencies(): DeferredComponentDependencies {
    return {
      settingsMenuComponent: { settingsService: this.settingsService, updateOrchestrator: this.updateOrchestrator, eventBus: this.eventBus, loggerFactory: this.loggerFactory, logger: this.logger },
      shaderSelectorComponent: { settingsService: this.settingsService, appState: this.appState, eventBus: this.eventBus, logger: this.logger },
      notesPanelComponent: { notesService: this.notesService, eventBus: this.eventBus, logger: this.logger }
    };
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
    this._warnMissingDeclaredActionTargets(actionRoot);
    this._uiActionsBound = true;

    this.logger.info('UI event listeners set up');
  }

  private _getUiActionRoot(): (ParentNode & EventTarget) {
    return document.body || document;
  }

  private _warnMissingDeclaredActionTargets(root: ParentNode): void {
    for (const target of UIActionTargets) {
      const element = root.querySelector(createTemplateRefSelector(target.ref)) as HTMLElement | null;
      const declaredAction = getTemplateAction(element);
      if (declaredAction !== target.action) {
        this.logger.warn(
          `UI action metadata drift for ${target.ref}: expected ${target.action}, found ${declaredAction || 'none'}`
        );
      }
    }
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
    void trpcClient.shell.openExternal.mutate(url).catch(err => {
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
