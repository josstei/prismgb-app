/**
 * Renderer dependency container factory and registration descriptors.
 *
 * This keeps registration metadata in one place:
 *   token + resolver type + lifecycle + dependencies.
 */

import * as awilix from 'awilix';
import type { AwilixContainer, Resolver } from 'awilix';

const { createContainer, asClass, asFunction, asValue, InjectionMode } = awilix;
const { PROXY } = InjectionMode;

type DependencyToken<TMap extends object> = keyof TMap & string;
type Lifecycle = 'singleton' | 'transient';

export type RendererResolverKind = 'class' | 'function' | 'value';

interface RendererDescriptorBase<TMap extends object, TToken extends DependencyToken<TMap>> {
  token: TToken;
  lifecycle?: Lifecycle;
  disposer?: (value: TMap[TToken]) => void | Promise<void>;
}

export interface RendererClassDescriptor<
  TMap extends object,
  TToken extends DependencyToken<TMap>
> extends RendererDescriptorBase<TMap, TToken> {
  kind: 'class';
  resolver: new (...args: never[]) => TMap[TToken];
  dependencies?: readonly DependencyToken<TMap>[];
}

export interface RendererFunctionDescriptor<
  TMap extends object,
  TToken extends DependencyToken<TMap>,
  TDependencies extends readonly DependencyToken<TMap>[] = readonly DependencyToken<TMap>[]
> extends RendererDescriptorBase<TMap, TToken> {
  kind: 'function';
  dependencies: TDependencies;
  resolver: (dependencies: Pick<TMap, TDependencies[number]>) => TMap[TToken];
}

export interface RendererValueDescriptor<TMap extends object, TToken extends DependencyToken<TMap>>
  extends RendererDescriptorBase<TMap, TToken> {
  kind: 'value';
  value: TMap[TToken];
}

export type RendererDescriptor<
  TMap extends object,
  TToken extends DependencyToken<TMap> = DependencyToken<TMap>
> =
  | RendererClassDescriptor<TMap, TToken>
  | RendererFunctionDescriptor<TMap, TToken>
  | RendererValueDescriptor<TMap, TToken>;

export function defineRendererDescriptors<TMap extends object>(
  descriptors: readonly RendererDescriptor<TMap>[]
): readonly RendererDescriptor<TMap>[] {
  return descriptors;
}

type ContainerWithRegistrations<TMap extends object> = AwilixContainer<TMap> & {
  registrations: Record<string, unknown>;
  hasRegistration?: (name: string) => boolean;
};

function hasRegistration<TMap extends object>(container: ContainerWithRegistrations<TMap>, token: string): boolean {
  const map = container.registrations ?? {};
  return Boolean(map[token] || container.hasRegistration?.(token));
}

function resolveDependencies<TMap extends object, TDependencies extends readonly DependencyToken<TMap>[]>(
  container: AwilixContainer<TMap>,
  descriptor: RendererFunctionDescriptor<TMap, DependencyToken<TMap>, TDependencies>,
  token: string
): Pick<TMap, TDependencies[number]> {
  const values = {} as Record<string, unknown>;
  const typedContainer = container as ContainerWithRegistrations<TMap>;

  for (const dependency of descriptor.dependencies) {
    if (!hasRegistration(typedContainer, dependency)) {
      throw new Error(`[RendererContainer] Missing dependency "${dependency}" for "${token}"`);
    }
    values[dependency] = typedContainer.resolve(dependency);
  }

  return values as Pick<TMap, TDependencies[number]>;
}

function defaultDisposer(value: unknown): void | Promise<void> {
  if (!value || typeof value !== 'object') {
    return;
  }

  const disposable = value as { dispose?: () => void | Promise<void> };
  if (typeof disposable.dispose === 'function') {
    return disposable.dispose();
  }
}

function applyLifecycle(resolver: unknown, lifecycle: Lifecycle): unknown {
  if (lifecycle === 'transient' && typeof (resolver as { transient?: () => unknown }).transient === 'function') {
    return (resolver as { transient: () => unknown }).transient();
  }

  if (lifecycle === 'singleton' && typeof (resolver as { singleton?: () => unknown }).singleton === 'function') {
    return (resolver as { singleton: () => unknown }).singleton();
  }

  return resolver;
}

function applyDisposer(
  resolver: unknown,
  disposer?: (value: unknown) => void | Promise<void>
): unknown {
  const disposableResolver = resolver as {
    disposer?: (value: unknown) => unknown;
  };

  if (!disposer || !disposableResolver.disposer) {
    return resolver;
  }
  return disposableResolver.disposer(disposer);
}

const fallbackDisposer = (value: unknown) => defaultDisposer(value);

export function registerRendererDescriptors<TMap extends object>(
  container: AwilixContainer<TMap>,
  descriptors: readonly RendererDescriptor<TMap>[]
): void {
  const typedContainer = container as unknown as {
    register: (pair: Record<string, unknown>) => void;
    registrations?: Record<string, unknown>;
  };

  const registrations = Object.keys(typedContainer.registrations ?? {});

  for (const descriptor of descriptors) {
    if (registrations.includes(descriptor.token)) {
      console.warn(
        `[RendererContainer] Token "${descriptor.token}" is already registered. Overwriting.`
      );
    }

    const lifecycle = descriptor.lifecycle ?? 'singleton';
    let resolver: unknown;

    if (descriptor.kind === 'value') {
      resolver = asFunction(() => descriptor.value) as Resolver<unknown>;
      resolver = applyLifecycle(resolver, lifecycle);
      resolver = applyDisposer(
        resolver,
        (descriptor.disposer as ((value: unknown) => void | Promise<void>) | undefined) ?? fallbackDisposer
      );
      typedContainer.register({
        [descriptor.token]: resolver as Resolver<unknown>
      });
      registrations.push(descriptor.token);
      continue;
    }

    if (descriptor.kind === 'class') {
      const classResolver = asClass(descriptor.resolver as new (...args: unknown[]) => unknown);
      resolver = applyLifecycle(classResolver, lifecycle);
      resolver = applyDisposer(
        resolver,
        (descriptor.disposer as ((value: unknown) => void | Promise<void>) | undefined) ?? fallbackDisposer
      );
      typedContainer.register({
        [descriptor.token]: resolver as Resolver<unknown>
      });
      registrations.push(descriptor.token);
      continue;
    }

    const functionDescriptor = descriptor;
    const functionResolver = asFunction(() => functionDescriptor.resolver(
      resolveDependencies(container, functionDescriptor, functionDescriptor.token)
    ));
    resolver = applyLifecycle(functionResolver as Resolver<unknown>, lifecycle);
    resolver = applyDisposer(
      resolver,
      (descriptor.disposer as ((value: unknown) => void | Promise<void>) | undefined) ?? fallbackDisposer
    );
    typedContainer.register({
      [descriptor.token]: resolver as Resolver<unknown>
    });
    registrations.push(descriptor.token);
  }
}

export {
  createContainer,
  asClass,
  asFunction,
  asValue,
  InjectionMode,
  PROXY
};

export type RendererContainer = ReturnType<typeof createContainer>;
