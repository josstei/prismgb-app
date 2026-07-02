import type { LoggerFactoryLike, LoggerLike, ValueOf, UnionToIntersection } from '@platform/core';

export type UIComponentStage = 'core' | 'deferred';

export type UIComponentContract<
  TElements extends object,
  TDependencies extends object,
  TInstance extends object
> = {
  elements: TElements;
  dependencies: TDependencies;
  instance: TInstance;
};

export type UIComponentCatalogShape<TCatalog> = {
  [TId in keyof TCatalog]: UIComponentContract<object, object, object>;
};

export type UIComponentId<TCatalog extends UIComponentCatalogShape<TCatalog>> = Extract<keyof TCatalog, string>;

export type UIComponentElements<
  TCatalog extends UIComponentCatalogShape<TCatalog>,
  TId extends UIComponentId<TCatalog>
> = TCatalog[TId]['elements'];

export type UIComponentDependencies<
  TCatalog extends UIComponentCatalogShape<TCatalog>,
  TId extends UIComponentId<TCatalog>
> = TCatalog[TId]['dependencies'];

export type UIComponentInstance<
  TCatalog extends UIComponentCatalogShape<TCatalog>,
  TId extends UIComponentId<TCatalog>
> = TCatalog[TId]['instance'];

export type UIComponentRegistryElements<TCatalog extends UIComponentCatalogShape<TCatalog>> = Partial<
  UnionToIntersection<ValueOf<{
    [TId in UIComponentId<TCatalog>]: UIComponentElements<TCatalog, TId>;
  }>>
>;

export type UIComponentRegistryDependencies<TCatalog extends UIComponentCatalogShape<TCatalog>> = Partial<
  UnionToIntersection<ValueOf<{
    [TId in UIComponentId<TCatalog>]: UIComponentDependencies<TCatalog, TId>;
  }>>
>;

export interface UIComponentContext<TElements extends object, TDependencies extends object> {
  elements?: Partial<TElements>;
  dependencies?: Partial<TDependencies>;
}

export interface UIComponentDefinition<
  TCatalog extends UIComponentCatalogShape<TCatalog>,
  TId extends UIComponentId<TCatalog>
> {
  id: TId;
  stage?: UIComponentStage;
  create(
    context: UIComponentContext<
      UIComponentElements<TCatalog, TId>,
      UIComponentDependencies<TCatalog, TId>
    >
  ): UIComponentInstance<TCatalog, TId> | null | undefined;
}

export type UIComponentDefinitionUnion<TCatalog extends UIComponentCatalogShape<TCatalog>> = {
  [TId in UIComponentId<TCatalog>]: UIComponentDefinition<TCatalog, TId>;
}[UIComponentId<TCatalog>];

type RegisteredUIComponentDefinition<TCatalog extends UIComponentCatalogShape<TCatalog>> =
  UIComponentDefinitionUnion<TCatalog> & { stage: UIComponentStage };

type UIComponentRegistryContext<TCatalog extends UIComponentCatalogShape<TCatalog>> = UIComponentContext<
  UIComponentRegistryElements<TCatalog>,
  UIComponentRegistryDependencies<TCatalog>
>;

type InitializableComponent<TElements extends object> = {
  initialize(elements: Partial<TElements>): void;
};

type DisposableComponent = {
  dispose(): void | Promise<void>;
};

export interface UIComponentRegistryOptions<TCatalog extends UIComponentCatalogShape<TCatalog>> {
  componentDefinitions?: readonly UIComponentDefinitionUnion<TCatalog>[];
  loggerFactory?: LoggerFactoryLike | null;
}

function hasInitializer<TElements extends object>(
  component: object
): component is InitializableComponent<TElements> {
  return 'initialize' in component && typeof component.initialize === 'function';
}

function hasDisposer(component: object): component is DisposableComponent {
  return 'dispose' in component && typeof component.dispose === 'function';
}

export class UIComponentRegistry<TCatalog extends UIComponentCatalogShape<TCatalog>> {
  declare definitions: Map<UIComponentId<TCatalog>, RegisteredUIComponentDefinition<TCatalog>>;
  declare components: Map<
    UIComponentId<TCatalog>,
    UIComponentInstance<TCatalog, UIComponentId<TCatalog>>
  >;
  declare logger: LoggerLike | undefined;

  constructor({ componentDefinitions = [], loggerFactory }: UIComponentRegistryOptions<TCatalog> = {}) {
    this.definitions = new Map();
    this.components = new Map();
    this.logger = loggerFactory?.create('UIComponentRegistry');

    componentDefinitions.forEach((definition) => {
      this.register(definition);
    });
  }

  register(definition: UIComponentDefinitionUnion<TCatalog>): void {
    const stage = definition.stage || 'core';
    this.definitions.set(definition.id, { ...definition, stage } as RegisteredUIComponentDefinition<TCatalog>);
  }

  initialize(
    elements?: UIComponentRegistryElements<TCatalog>,
    dependencies: UIComponentRegistryDependencies<TCatalog> = {}
  ): void {
    this.logger?.debug('Initializing UI components');

    const coreDefinitions = Array.from(this.definitions.values())
      .filter((definition) => definition.stage === 'core');

    coreDefinitions.forEach((definition) => {
      if (this.components.has(definition.id)) return;
      this._createComponent(definition, { elements, dependencies });
    });

    this.logger?.info(`Initialized ${this.components.size} UI components`);
  }

  initializeComponent<TId extends UIComponentId<TCatalog>>(
    id: TId,
    { elements, dependencies }: UIComponentContext<
      UIComponentElements<TCatalog, TId>,
      UIComponentDependencies<TCatalog, TId>
    > = {}
  ): UIComponentInstance<TCatalog, TId> | undefined {
    if (this.components.has(id)) {
      return this.get(id);
    }

    const definition = this.definitions.get(id);
    if (!definition) {
      this.logger?.warn(`Component definition not found: ${id}`);
      return undefined;
    }

    this.logger?.debug(`Initializing component: ${id}`);
    const component = this._createComponent(definition, { elements, dependencies });
    this.logger?.info(`${id} component initialized`);
    return component;
  }

  get<TId extends UIComponentId<TCatalog>>(name: TId): UIComponentInstance<TCatalog, TId> | undefined {
    return this.components.get(name) as UIComponentInstance<TCatalog, TId> | undefined;
  }

  async dispose(): Promise<void> {
    this.logger?.debug('Disposing UI components');

    for (const [name, component] of Array.from(this.components.entries()).reverse()) {
      if (hasDisposer(component)) {
        this.logger?.debug(`Disposing component: ${name}`);
        try {
          await component.dispose();
        } catch (error) {
          this.logger?.error(`Error disposing component: ${name}`, error);
        }
      }
    }

    this.components.clear();
    this.logger?.info('All UI components disposed');
  }

  private _createComponent(
    definition: RegisteredUIComponentDefinition<TCatalog>,
    { elements, dependencies }: UIComponentRegistryContext<TCatalog>
  ): UIComponentInstance<TCatalog, UIComponentId<TCatalog>> | undefined {
    const component = definition.create({ elements, dependencies });
    if (!component) {
      this.logger?.warn(`Component creation failed: ${definition.id}`);
      return undefined;
    }

    if (elements && hasInitializer(component)) {
      component.initialize(elements);
    }

    this.components.set(definition.id, component);
    return component;
  }
}
