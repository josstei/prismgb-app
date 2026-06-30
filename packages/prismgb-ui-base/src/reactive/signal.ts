type EffectRunner = {
  run(): void;
  deps: Set<Set<EffectRunner>>;
  active: boolean;
};

let activeEffect: EffectRunner | null = null;

function track(subscribers: Set<EffectRunner>): void {
  if (activeEffect) {
    subscribers.add(activeEffect);
    activeEffect.deps.add(subscribers);
  }
}

function trigger(subscribers: Set<EffectRunner>): void {
  for (const runner of [...subscribers]) {
    if (runner.active) {
      runner.run();
    }
  }
}

function detach(runner: EffectRunner): void {
  for (const dep of runner.deps) {
    dep.delete(runner);
  }
  runner.deps.clear();
}

export interface ReadonlySignal<T> {
  readonly value: T;
  peek(): T;
}

export interface Signal<T> extends ReadonlySignal<T> {
  value: T;
}

export function signal<T>(initial: T): Signal<T> {
  let current = initial;
  const subscribers = new Set<EffectRunner>();
  return {
    get value(): T {
      track(subscribers);
      return current;
    },
    set value(next: T) {
      if (Object.is(current, next)) return;
      current = next;
      trigger(subscribers);
    },
    peek(): T {
      return current;
    }
  };
}

export function effect(fn: () => void): () => void {
  const runner: EffectRunner = {
    deps: new Set(),
    active: true,
    run(): void {
      if (!runner.active) return;
      detach(runner);
      const previous = activeEffect;
      activeEffect = runner;
      try {
        fn();
      } finally {
        activeEffect = previous;
      }
    }
  };
  runner.run();
  return () => {
    if (!runner.active) return;
    runner.active = false;
    detach(runner);
  };
}

export function computed<T>(fn: () => T): ReadonlySignal<T> {
  const derived = signal<T>(undefined as T);
  effect(() => {
    derived.value = fn();
  });
  return {
    get value(): T {
      return derived.value;
    },
    peek(): T {
      return derived.peek();
    }
  };
}
