import type { ServiceIdentifier } from 'inversify';
import type { Logger, LoggerFactory } from '@platform/core';
import { TOKENS } from '@renderer/application/di/tokens';

export const CORE_COMPONENT_IDS = [
  'statusNotificationComponent',
  'deviceStatusComponent',
  'streamingControlsComponent',
  'transcodeProgressComponent'
] as const;

export const DEFERRED_COMPONENT_IDS = ['settingsMenuComponent', 'shaderSelectorComponent', 'notesPanelComponent'] as const;

export type DeferredComponentId = (typeof DEFERRED_COMPONENT_IDS)[number];
type UiComponentId = (typeof CORE_COMPONENT_IDS)[number] | DeferredComponentId;
type UiComponent<TId extends UiComponentId> = (typeof TOKENS)[TId] extends ServiceIdentifier<infer TComponent>
  ? TComponent
  : never;

type ComponentResolver = <TComponent>(token: ServiceIdentifier<TComponent>) => TComponent;

/**
 * Resolves UI components lazily by id and caches them; dispose() unwinds them in reverse
 * resolution order.
 */
export class UiComponentHost {
  private readonly resolved = new Map<UiComponentId, UiComponent<UiComponentId>>();
  private readonly logger: Logger;

  constructor(private readonly resolve: ComponentResolver, loggerFactory: LoggerFactory) {
    this.logger = loggerFactory.create('UiComponentHost');
  }

  get<TId extends UiComponentId>(id: TId): UiComponent<TId> {
    let component = this.resolved.get(id);
    if (!component) {
      component = this.resolve<UiComponent<UiComponentId>>(TOKENS[id]);
      this.resolved.set(id, component);
    }
    return component as UiComponent<TId>;
  }

  resolveCore(): void {
    CORE_COMPONENT_IDS.forEach((id) => this.get(id));
  }

  resolveDeferred(): void {
    DEFERRED_COMPONENT_IDS.forEach((id) => this.get(id));
  }

  async dispose(): Promise<void> {
    for (const [id, component] of [...this.resolved].reverse()) {
      try {
        await component.dispose();
      } catch (error) {
        this.logger.error(`Error disposing component: ${id}`, error);
      }
    }
    this.resolved.clear();
  }
}
