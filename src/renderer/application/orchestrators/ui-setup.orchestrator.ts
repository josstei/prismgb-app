import { BaseOrchestrator } from '@shared/base/orchestrator.base.js';
import {
  createDomListenerManager,
  type DomListenerManager
} from '@shared/base/dom-listener.utils.js';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { EventChannels } from '@shared/events/event-channels.js';
import { getTemplateAction } from '@renderer/presentation/primitives/template-ref.utils.js';
import type { EventBusLike, LoggerFactoryLike } from '@shared/interfaces/infrastructure.types.js';
import type { SettingsService } from '@renderer/infrastructure/services/settings';
import type { NotesService } from '@renderer/infrastructure/services/notes';
import type { UpdateOrchestrator } from '@renderer/application/orchestrators/update.orchestrator';
import type { UIController } from '@renderer/presentation/controller/ui.controller.js';

type AppStateLike = {
  readonly isStreaming: boolean;
  readonly isCinematicModeEnabled?: boolean;
};

const UIActionIds = { SCREENSHOT_CAPTURE: 'capture.screenshot', RECORDING_TOGGLE: 'recording.toggle', FULLSCREEN_TOGGLE: 'fullscreen.toggle', SETTINGS_TOGGLE: 'settings.toggle', SHADER_TOGGLE: 'shader.toggle', STREAM_START: 'stream.start', STREAM_STOP: 'stream.stop' } as const;

type UIActionId = typeof UIActionIds[keyof typeof UIActionIds];

type UIActionControllerCommand = 'toggleSettingsMenu' | 'toggleShaderSelector';

type UIActionCommand =
  | { kind: 'publish'; channel: string }
  | { kind: 'controller'; method: UIActionControllerCommand }
  | { kind: 'clear-title' };

type UIActionCondition = 'overlay-visible' | 'streaming';

interface UIActionDescriptor {
  action: UIActionId;
  element: keyof UIController['elements'] & string;
  event: 'click' | 'mousedown';
  command: UIActionCommand;
  condition?: UIActionCondition;
  logMessage?: string;
  stopPropagation?: boolean;
  blurCurrentTarget?: boolean;
}

const UIActionDescriptors = [
  { action: UIActionIds.STREAM_START, element: 'streamOverlay', event: 'click', command: { kind: 'publish', channel: EventChannels.UI.STREAM_START_REQUESTED }, condition: 'overlay-visible', logMessage: 'Overlay clicked - requesting stream start' },
  { action: UIActionIds.STREAM_STOP, element: 'streamVideo', event: 'click', command: { kind: 'publish', channel: EventChannels.UI.STREAM_STOP_REQUESTED }, condition: 'streaming', logMessage: 'Stream clicked - requesting stream stop' },
  { action: UIActionIds.STREAM_STOP, element: 'streamCanvas', event: 'click', command: { kind: 'publish', channel: EventChannels.UI.STREAM_STOP_REQUESTED }, condition: 'streaming', logMessage: 'Stream clicked - requesting stream stop' },
  { action: UIActionIds.SCREENSHOT_CAPTURE, element: 'screenshotBtn', event: 'click', command: { kind: 'publish', channel: EventChannels.UI.SCREENSHOT_REQUESTED } },
  { action: UIActionIds.RECORDING_TOGGLE, element: 'recordBtn', event: 'click', command: { kind: 'publish', channel: EventChannels.UI.RECORDING_TOGGLE_REQUESTED } },
  { action: UIActionIds.FULLSCREEN_TOGGLE, element: 'fullscreenBtn', event: 'click', command: { kind: 'publish', channel: EventChannels.UI.FULLSCREEN_TOGGLE_REQUESTED }, blurCurrentTarget: true },
  { action: UIActionIds.FULLSCREEN_TOGGLE, element: 'fullscreenBtn', event: 'mousedown', command: { kind: 'clear-title' } },
  { action: UIActionIds.SETTINGS_TOGGLE, element: 'settingsBtn', event: 'click', command: { kind: 'controller', method: 'toggleSettingsMenu' }, stopPropagation: true },
  { action: UIActionIds.SHADER_TOGGLE, element: 'shaderBtn', event: 'click', command: { kind: 'controller', method: 'toggleShaderSelector' }, stopPropagation: true },
  { action: UIActionIds.FULLSCREEN_TOGGLE, element: 'fsExitBtn', event: 'click', command: { kind: 'publish', channel: EventChannels.UI.FULLSCREEN_TOGGLE_REQUESTED }, blurCurrentTarget: true },
  { action: UIActionIds.FULLSCREEN_TOGGLE, element: 'fsExitBtn', event: 'mousedown', command: { kind: 'clear-title' } }
] as const satisfies readonly UIActionDescriptor[];

type UISetupOrchestratorDependencies = {
  appState: AppStateLike;
  updateOrchestrator: UpdateOrchestrator;
  settingsService: SettingsService;
  notesService: NotesService;
  uiController: UIController;
  eventBus: EventBusLike;
  loggerFactory: LoggerFactoryLike;
};

export class UISetupOrchestrator extends BaseOrchestrator {
  private readonly appState: AppStateLike;
  private readonly updateOrchestrator: UpdateOrchestrator;
  private readonly settingsService: SettingsService;
  private readonly notesService: NotesService;
  private readonly uiController: UIController;
  private readonly loggerFactory: LoggerFactoryLike;
  private readonly _domListeners: DomListenerManager;
  private _uiActionsBound: boolean;

  constructor(dependencies: UISetupOrchestratorDependencies) {
    super(
      dependencies,
      ['appState', 'updateOrchestrator', 'settingsService', 'notesService', 'uiController', 'eventBus', 'loggerFactory'],
      'UISetupOrchestrator'
    );

    this.appState = dependencies.appState;
    this.updateOrchestrator = dependencies.updateOrchestrator;
    this.settingsService = dependencies.settingsService;
    this.notesService = dependencies.notesService;
    this.uiController = dependencies.uiController;
    this.eventBus = dependencies.eventBus;
    this.loggerFactory = dependencies.loggerFactory;
    this._domListeners = createDomListenerManager({ logger: this.logger });
    this._uiActionsBound = false;
  }

  async onInitialize(): Promise<void> {
    this.subscribeWithCleanup({
      [EventChannels.RENDER.CANVAS_RECREATED]: (data) => this._handleCanvasRecreated(data)
    });
  }

  _handleCanvasRecreated(data: unknown): void {
    if (typeof data !== 'object' || data === null) {
      return;
    }
    const { oldCanvas, newCanvas } = data as {
      oldCanvas?: HTMLCanvasElement;
      newCanvas?: HTMLCanvasElement;
    };
    if (!oldCanvas || !newCanvas) {
      return;
    }

    const removed = this._domListeners.removeByTarget(oldCanvas);
    this.logger.debug(`Removed ${removed} listener(s) from old canvas`);

    if (this._uiActionsBound) {
      UIActionDescriptors
        .filter((descriptor) => descriptor.element === 'streamCanvas')
        .forEach((descriptor) => this._bindUiAction(descriptor));
      this.logger.debug('Rebound stream canvas action handler');
    }
  }

  initializeSettingsMenu(): void {
    this.uiController.initSettingsMenu({
      settingsService: this.settingsService,
      updateOrchestrator: this.updateOrchestrator,
      eventBus: this.eventBus,
      loggerFactory: this.loggerFactory,
      logger: this.logger
    });
  }

  initializeShaderSelector(): void {
    const elements = this.uiController.dom?.streaming;
    this.uiController.initShaderSelector(
      {
        settingsService: this.settingsService,
        appState: this.appState,
        eventBus: this.eventBus,
        logger: this.logger
      },
      {
        shaderBtn: elements?.shaderBtn,
        shaderDropdown: elements?.shaderDropdown,
        shaderOptions: elements?.shaderOptions,
        shaderUnavailableMessage: elements?.shaderUnavailableMessage,
        cinematicToggle: elements?.cinematicToggle,
        cinematicPillText: elements?.cinematicPillText,
        brightnessSlider: elements?.brightnessSlider,
        brightnessPercentage: elements?.brightnessPercentage,
        brightnessControl: elements?.brightnessControl,
        volumeSlider: elements?.volumeSliderVertical,
        volumePercentage: elements?.volumePercentageVertical,
        streamVideo: elements?.streamVideo
      }
    );
  }

  initializeNotesPanel(): void {
    const notesElements = {
      ...this.uiController.dom?.notes,
      streamContainer: this.uiController.dom?.streaming?.streamContainer,
      streamToolbar: this.uiController.dom?.streaming?.streamToolbar
    };
    this.uiController.initNotesPanel(
      {
        notesService: this.notesService,
        eventBus: this.eventBus,
        logger: this.logger
      },
      notesElements
    );
  }

  setupUIEventListeners(): void {
    if (this._uiActionsBound) {
      return;
    }
    UIActionDescriptors.forEach((descriptor) => this._bindUiAction(descriptor));
    this._uiActionsBound = true;

    this.logger.info('UI event listeners set up');
  }

  private _bindUiAction(descriptor: UIActionDescriptor): void {
    const element = this.uiController.elements[descriptor.element];
    const declaredAction = getTemplateAction(element);

    if (element && declaredAction !== descriptor.action) {
      this.logger.warn(
        `UI action metadata drift for ${descriptor.element}: expected ${descriptor.action}, found ${declaredAction || 'none'}`
      );
    }

    if (!element) {
      this.logger.warn(`Element not found: ${descriptor.element}`);
      return;
    }

    this._domListeners.add(element, descriptor.event, (event) =>
      this._executeUiAction(descriptor, event)
    );
  }

  private _executeUiAction(descriptor: UIActionDescriptor, event: Event): void {
    if (!this._isUiActionEnabled(descriptor, event)) {
      return;
    }

    if (descriptor.stopPropagation) {
      event.stopPropagation();
    }

    if (descriptor.blurCurrentTarget) {
      (event.currentTarget as HTMLElement | null)?.blur();
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
        this._clearCurrentTargetTitle(event);
        break;
    }
  }

  private _isUiActionEnabled(descriptor: UIActionDescriptor, event: Event): boolean {
    switch (descriptor.condition) {
      case 'overlay-visible':
        return !(event.currentTarget as HTMLElement | null)?.classList.contains(CSSClasses.HIDDEN);
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
    }
  }

  private _clearCurrentTargetTitle(event: Event): void {
    const target = event.currentTarget as HTMLElement | null;
    if (target) {
      target.title = '';
    }
  }

  async onCleanup(): Promise<void> {
    this.logger.info('Cleaning up UISetupOrchestrator...');
    this._domListeners.removeAll();
    this._uiActionsBound = false;
    this.logger.info('UISetupOrchestrator cleanup complete');
  }
}
