import { injectable, inject } from 'inversify';
import { BaseOrchestrator, type LoggerFactory } from '@platform/core';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import {
  UIActionDescriptors,
  UIActionEvents,
  findActionTarget,
  getAction,
  isUIActionId,
  type UIActionDescriptor,
  type UIActionEvent
} from '@renderer/presentation/primitives/ui-actions.definitions';
import { TOKENS } from '@renderer/application/di/tokens';
import type { EventBus } from '@renderer/lib/events/event-bus';
import type { UiComponentHost } from '@renderer/presentation/ui-component.host';
import type { StreamingService } from '@renderer/infrastructure/services/streaming/streaming.service';

const UI_ACTION_LISTENERS = Symbol('uiActionListeners');

@injectable()
export class UISetupOrchestrator extends BaseOrchestrator {
  private uiActionsBound = false;

  constructor(
    @inject(TOKENS.streamingService) private readonly streamingService: Pick<StreamingService, 'isStreaming'>,
    @inject(TOKENS.uiComponentHost) private readonly components: UiComponentHost,
    @inject(TOKENS.eventBus) private readonly eventBus: EventBus,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactory
  ) {
    super(loggerFactory, 'UISetupOrchestrator', eventBus);
  }

  initializeDeferredComponents(): void {
    this.components.resolveDeferred();
  }

  setupUIEventListeners(): void {
    if (this.uiActionsBound) {
      return;
    }
    const actionRoot = document.body || document;
    this.disposables.replaceGroup(UI_ACTION_LISTENERS, UIActionEvents.map((eventName) =>
      this.disposables.listen(actionRoot, eventName, (event) =>
        this.executeDelegatedUiAction(eventName, event, actionRoot)
      )
    ));
    this.uiActionsBound = true;

    this.logger.info('UI event listeners set up');
  }

  private executeDelegatedUiAction(eventName: UIActionEvent, event: Event, root: Node): void {
    const actionTarget = findActionTarget(event, root);
    if (!actionTarget) {
      return;
    }

    const action = getAction(actionTarget);
    if (!isUIActionId(action)) {
      if (eventName === 'click' && action) {
        this.logger.warn(`Unknown UI action: ${action}`);
      }
      return;
    }

    for (const descriptor of UIActionDescriptors) {
      if (descriptor.event === eventName && descriptor.action === action) {
        this.executeUiAction(descriptor, event, actionTarget);
      }
    }
  }

  private executeUiAction(descriptor: UIActionDescriptor, event: Event, actionTarget: HTMLElement): void {
    if (!this.isUiActionEnabled(descriptor, actionTarget)) {
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

    const { command } = descriptor;
    switch (command.kind) {
      case 'publish':
        this.eventBus.publish(command.channel);
        break;
      case 'toggle':
        this.components.get(command.component).toggle();
        break;
      case 'clear-title':
        actionTarget.title = '';
        break;
      case 'external':
        event.preventDefault();
        void trpcClient.shell.openExternal.mutate({ url: command.url }).catch((error) => {
          this.logger.warn('Failed to open external URL:', error);
        });
        break;
    }
  }

  private isUiActionEnabled(descriptor: UIActionDescriptor, actionTarget: HTMLElement): boolean {
    switch (descriptor.condition) {
      case 'overlay-visible':
        return !actionTarget.classList.contains(CSSClasses.HIDDEN);
      case 'streaming':
        return this.streamingService.isStreaming;
      default:
        return true;
    }
  }

  async onCleanup(): Promise<void> {
    this.logger.info('Cleaning up UISetupOrchestrator...');
    await this.disposables.cancel(UI_ACTION_LISTENERS);
    this.uiActionsBound = false;
    this.logger.info('UISetupOrchestrator cleanup complete');
  }
}
