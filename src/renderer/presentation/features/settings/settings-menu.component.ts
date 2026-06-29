import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import {
  PresentationComponent,
  DisclosureController,
  ListboxDropdownController,
  type PresentationLifecycleToken
} from '@prismgb/ui-base';
import {
  getBooleanSettingsUiDefinitions,
  getListboxSettingsUiDefinitions,
  hasExternalSource,
  type SettingsControlDefinition,
  type SettingsListboxDefinition
} from '@renderer/lib/settings.definitions.js';
import type { LoggerLike } from '@prismgb/core';
import type { UpdateSectionElements } from '@renderer/presentation/features/updates/update-section.component.js';

declare const __APP_VERSION__: string | undefined;

type CheckboxElement = HTMLInputElement & { checked: boolean };
type SettingValue = string | number | boolean;
type SettingResult = SettingValue | Promise<SettingValue>;
type BooleanSettingBinding = readonly [CheckboxElement | null | undefined, string, ((value: boolean) => void)?];

type ListboxElementBinding = { definition: SettingsListboxDefinition; triggerElement: HTMLElement; labelElement: HTMLElement | null; menuElement: HTMLElement };

interface SettingsServiceLike {
  getBooleanSetting(name: string): boolean;
  getStringSetting(name: string): string;
  getSetting(name: string): SettingResult;
  setSetting(name: string, value: unknown): boolean | Promise<boolean>;
}

type UpdateSectionLike = { initialize(elements: UpdateSectionElements): void; setCurrentVersion(version: string): void; dispose(): void | Promise<void> };

const BOOLEAN_SETTING_SIDE_EFFECTS = {
  statusStripVisible: (component: SettingsMenuComponent, visible: boolean) => component._applyStatusStripVisibility(visible)
} as const;
const SETTINGS_MENU_ASYNC_SETTINGS_LIFECYCLE = Symbol('settingsMenuAsyncSettingsLifecycle');
const SETTINGS_MENU_CHILD_COMPONENT_LIFECYCLE = Symbol('settingsMenuChildComponentLifecycle');

function getSettingsElement<TElement extends HTMLElement>(elements: SettingsMenuElements, ref: string): TElement | null {
  const elementMap = elements as Partial<Record<string, HTMLElement | null>>;
  return (elementMap[ref] ?? null) as TElement | null;
}

export interface SettingsMenuElements extends UpdateSectionDomElements {
  settingsMenuContainer?: HTMLElement | null;
  settingsBtn?: HTMLElement | null;
  disclaimerBtn?: HTMLElement | null;
  disclaimerContent?: HTMLElement | null;
  footer?: HTMLElement | null;
}

interface UpdateSectionDomElements {
  updateSection?: HTMLElement | null;
  updateCurrentVersion?: HTMLElement | null;
  updateStatusIndicator?: HTMLElement | null;
  updateStatusText?: HTMLElement | null;
  updateProgressContainer?: HTMLElement | null;
  updateProgressFill?: HTMLElement | null;
  updateProgressText?: HTMLElement | null;
  updateActionBtn?: (HTMLElement & { disabled: boolean }) | null;
  updateBadge?: HTMLElement | null;
}

export interface SettingsMenuComponentOptions {
  settingsService: SettingsServiceLike;
  updateSectionComponent?: UpdateSectionLike | null;
  logger?: LoggerLike | null;
}

class SettingsMenuComponent extends PresentationComponent {
  declare settingsService: SettingsServiceLike;
  declare logger: LoggerLike | null | undefined;
  declare isVisible: boolean;
  declare _menuDisclosure: DisclosureController | null;
  declare _disclaimerDisclosure: DisclosureController | null;
  declare listboxDropdowns: Map<string, ListboxDropdownController>;
  declare listboxElements: Map<string, ListboxElementBinding>;
  declare _updateSection: UpdateSectionLike | null;
  declare _initialized: boolean;
  declare container: HTMLElement | null | undefined;
  declare toggleButton: HTMLElement | null | undefined;
  declare checkboxElements: Map<string, CheckboxElement>;
  declare disclaimerBtn: HTMLElement | null | undefined;
  declare disclaimerContent: HTMLElement | null | undefined;
  declare footer: HTMLElement | null | undefined;
  declare updateElements: UpdateSectionElements;

  get disclaimerExpanded(): boolean {
    return this._disclaimerDisclosure?.isOpen() ?? false;
  }
  set disclaimerExpanded(value: boolean) {
    if (value) this._disclaimerDisclosure?.show();
    else this._disclaimerDisclosure?.hide();
  }

  get statusStripCheckbox(): CheckboxElement | null | undefined {
    return this.checkboxElements.get('statusStripVisible');
  }

  get animationSaverCheckbox(): CheckboxElement | null | undefined {
    return this.checkboxElements.get('performanceMode');
  }

  _expandDisclaimer(): void {
    this._disclaimerDisclosure?.show();
  }

  _collapseDisclaimer(): void {
    this._disclaimerDisclosure?.hide();
  }

  constructor({ settingsService, updateSectionComponent, logger }: SettingsMenuComponentOptions) {
    super();

    this.settingsService = settingsService;
    this.logger = logger;
    this.isVisible = false;
    this._menuDisclosure = null;
    this._disclaimerDisclosure = null;
    this.listboxDropdowns = new Map();
    this.listboxElements = new Map();
    this._updateSection = updateSectionComponent || null;
    this._initialized = false;
    this.checkboxElements = new Map();
    this.updateElements = {};
  }

  initialize(elements: SettingsMenuElements): void {
    this._resetExistingInitialization();
    const asyncSettingsToken = this.createLifecycleToken(SETTINGS_MENU_ASYNC_SETTINGS_LIFECYCLE);

    this.container = elements.settingsMenuContainer;
    this.toggleButton = elements.settingsBtn;
    this.checkboxElements = this._createCheckboxElementMap(elements);
    this.listboxElements = this._createListboxElementMap(elements);
    this.disclaimerBtn = elements.disclaimerBtn;
    this.disclaimerContent = elements.disclaimerContent;
    this.footer = elements.footer;
    this.updateElements = {
      section: elements.updateSection,
      currentVersion: elements.updateCurrentVersion,
      statusIndicator: elements.updateStatusIndicator,
      statusText: elements.updateStatusText,
      progressContainer: elements.updateProgressContainer,
      progressFill: elements.updateProgressFill,
      progressText: elements.updateProgressText,
      actionBtn: elements.updateActionBtn,
      badge: elements.updateBadge
    };

    if (!this.container || !this.toggleButton) {
      this.logger?.warn('Settings menu elements not found');
      this._initialized = false;
      void asyncSettingsToken.dispose();
      return;
    }

    this._initialized = true;
    this._bindEvents();
    this._setupMenuDisclosure();
    this._setupListboxDropdowns();
    this._trackRuntimeChildren();
    this._initializeUpdateSection();
    this._loadCurrentSettings(asyncSettingsToken);

    this.logger?.debug('SettingsMenuComponent initialized');
  }

  _initializeUpdateSection(): void {
    if (!this._updateSection) {
      this.logger?.debug('UpdateSectionComponent not provided - update section disabled');
      return;
    }

    this._updateSection.initialize(this.updateElements);

    if (typeof __APP_VERSION__ !== 'undefined') {
      this._updateSection.setCurrentVersion(__APP_VERSION__);
    }
  }

  _bindEvents(): void {
    for (const [checkbox, settingName, afterChange] of this._getBooleanSettingBindings()) {
      if (!checkbox) continue;
      this.listen(checkbox, 'change', () => {
        const value = checkbox.checked;
        this.settingsService.setSetting(settingName, value);
        afterChange?.(value);
      });
    }

    if (this.disclaimerBtn && this.disclaimerContent) {
      this.listen(this.disclaimerBtn, 'click', () => {
        this._disclaimerDisclosure?.toggle();
      });
    }
  }

  _loadCurrentSettings(asyncSettingsToken: PresentationLifecycleToken): void {
    for (const [checkbox, settingName, afterLoad] of this._getBooleanSettingBindings({ includeAsync: false })) {
      const value = this.settingsService.getBooleanSetting(settingName);
      if (checkbox) checkbox.checked = value;
      afterLoad?.(value);
    }

    for (const [settingName, dropdown] of this.listboxDropdowns) {
      const definition = this.listboxElements.get(settingName)?.definition;
      if (definition) {
        dropdown.setActive(this.settingsService.getStringSetting(definition.name));
      }
    }
    void this._loadAsyncSettings(asyncSettingsToken);
  }

  async _loadAsyncSettings(asyncSettingsToken: PresentationLifecycleToken): Promise<void> {
    const asyncDefinitions = getBooleanSettingsUiDefinitions().filter(hasExternalSource);
    for (const definition of asyncDefinitions) {
      const enabled = await this.settingsService.getSetting(definition.name);

      if (!this._initialized || !asyncSettingsToken.isActive()) {
        return;
      }

      const checkbox = this.checkboxElements.get(definition.name);
      if (checkbox) {
        checkbox.checked = Boolean(enabled);
      }
    }
  }

  _applyStatusStripVisibility(visible: boolean): void {
    if (!this.footer) return;
    this.footer.classList.toggle(CSSClasses.STATUS_HIDDEN, !visible);
  }

  toggle(): void { this._menuDisclosure?.toggle(); }
  show(): void { this._menuDisclosure?.show(); }
  hide(): void { this._menuDisclosure?.hide(); }

  _setupListboxDropdowns(): void {
    for (const binding of this.listboxElements.values()) {
      const dropdown = new ListboxDropdownController({
        triggerElement: binding.triggerElement,
        menuElement: binding.menuElement,
        labelElement: binding.labelElement,
        optionSelector: '.settings-select-option',
        ignoreOutsideSelectors: ['.settings-select-wrapper'],
        onChange: (value) => {
          this.settingsService.setSetting(binding.definition.name, value);
        },
        logger: this.logger
      });

      dropdown.initialize();
      this.listboxDropdowns.set(binding.definition.name, dropdown);
    }
  }

  _setupMenuDisclosure(): void {
    if (!this.container || !this.toggleButton) return;

    this._menuDisclosure = new DisclosureController({
      toggleElement: this.toggleButton,
      panelElement: this.container,
      visibleClass: CSSClasses.VISIBLE,
      logger: this.logger,
      onShow: () => {
        this.isVisible = true;
        this.logger?.debug('Settings menu shown');
      },
      onHide: () => {
        this.isVisible = false;
        for (const dropdown of this.listboxDropdowns.values()) {
          dropdown.hide();
        }
        this._disclaimerDisclosure?.hide();
        this.logger?.debug('Settings menu hidden');
      }
    });

    this._menuDisclosure.initialize();
    this._setupDisclaimerDisclosure();
  }

  _setupDisclaimerDisclosure(): void {
    if (!this.disclaimerBtn || !this.disclaimerContent) return;

    this._disclaimerDisclosure = new DisclosureController({
      toggleElement: this.disclaimerBtn,
      panelElement: this.disclaimerContent,
      visibleClass: CSSClasses.VISIBLE,
      closeOnEscape: false,
      closeOnClickOutside: false,
      logger: this.logger
    });

    this._disclaimerDisclosure.initialize();
  }

  _resetExistingInitialization(): void {
    if (this._initialized || this._disposables.size || this._menuDisclosure || this.listboxDropdowns.size) {
      void this._releaseRuntimeLifecycle();
    }
  }

  _trackRuntimeChildren(): void {
    const menuDisclosure = this._menuDisclosure;
    const disclaimerDisclosure = this._disclaimerDisclosure;
    const dropdowns = new Map(this.listboxDropdowns);
    const updateSection = this._updateSection;

    this.replaceManaged(SETTINGS_MENU_CHILD_COMPONENT_LIFECYCLE, async () => {
      await Promise.all([
        menuDisclosure?.dispose(),
        disclaimerDisclosure?.dispose(),
        ...Array.from(dropdowns.values(), (dropdown) => dropdown.dispose()),
        updateSection?.dispose()
      ]);
      if (this._menuDisclosure === menuDisclosure) this._menuDisclosure = null;
      if (this._disclaimerDisclosure === disclaimerDisclosure) this._disclaimerDisclosure = null;
      for (const [name, dropdown] of dropdowns) {
        if (this.listboxDropdowns.get(name) === dropdown) this.listboxDropdowns.delete(name);
      }
    });
  }

  _releaseRuntimeLifecycle(): Promise<void> {
    const disposed = super.dispose();
    this._menuDisclosure = null;
    this._disclaimerDisclosure = null;
    this.listboxDropdowns.clear();
    this._clearElementReferences();
    this.isVisible = false;
    this._initialized = false;
    return Promise.resolve(disposed);
  }

  _clearElementReferences(): void {
    Object.assign(this, {
      container: null, toggleButton: null,
      disclaimerBtn: null, disclaimerContent: null, footer: null
    });
    this.checkboxElements.clear();
    this.listboxElements.clear();
    this.updateElements = {};
  }

  _getBooleanSettingBindings({ includeAsync = true }: { includeAsync?: boolean } = {}): BooleanSettingBinding[] {
    return getBooleanSettingsUiDefinitions()
      .filter((definition) => includeAsync || !hasExternalSource(definition))
      .map((definition) => [
        this.checkboxElements.get(definition.name),
        definition.name,
        this._getBooleanSettingSideEffect(definition)
      ]);
  }

  _createCheckboxElementMap(elements: SettingsMenuElements): Map<string, CheckboxElement> {
    const checkboxElements = new Map<string, CheckboxElement>();
    for (const definition of getBooleanSettingsUiDefinitions()) {
      const element = getSettingsElement<CheckboxElement>(elements, definition.ui.controlId);
      if (element) {
        checkboxElements.set(definition.name, element);
      }
    }
    return checkboxElements;
  }

  _createListboxElementMap(elements: SettingsMenuElements): Map<string, ListboxElementBinding> {
    const listboxElements = new Map<string, ListboxElementBinding>();

    for (const definition of getListboxSettingsUiDefinitions()) {
      const triggerElement = getSettingsElement<HTMLElement>(elements, definition.ui.controlId);
      const labelElement = getSettingsElement<HTMLElement>(elements, definition.ui.labelId);
      const menuElement = getSettingsElement<HTMLElement>(elements, definition.ui.menuId);

      if (triggerElement && menuElement) {
        listboxElements.set(definition.name, { definition, triggerElement, labelElement, menuElement });
      }
    }

    return listboxElements;
  }

  _getBooleanSettingSideEffect(definition: SettingsControlDefinition): ((value: boolean) => void) | undefined {
    const sideEffect = BOOLEAN_SETTING_SIDE_EFFECTS[definition.name as keyof typeof BOOLEAN_SETTING_SIDE_EFFECTS];
    return sideEffect ? (visible) => sideEffect(this, visible) : undefined;
  }

  override dispose(): Promise<void> { return this._releaseRuntimeLifecycle(); }
}

export { SettingsMenuComponent };
