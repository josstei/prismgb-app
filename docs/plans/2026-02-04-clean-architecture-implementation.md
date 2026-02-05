# Clean Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure PrismGB to Clean Architecture with TypeScript, extracting GPU rendering as `@prismgb/gpu` package.

**Architecture:** Layer-by-layer migration: core/ → @prismgb/gpu → main/ → renderer/infrastructure → renderer/application → renderer/presentation. Each phase is a separate PR with passing tests.

**Tech Stack:** TypeScript 5.x, Vite 7.x, Vitest 4.x, npm workspaces

---

## Phase 0: Workspace & TypeScript Setup

### Task 0.1: Create Workspace Root Configuration

**Files:**
- Create: `prismgb-workspace/package.json`
- Create: `prismgb-workspace/tsconfig.base.json`
- Modify: `prismgb-app/package.json`

**Step 1: Create workspace root package.json**

```bash
cd /Users/josstei/Development/prismgb-workspace
```

Create `package.json`:

```json
{
  "name": "prismgb-workspace",
  "private": true,
  "workspaces": [
    "prismgb-app",
    "prismgb-gpu"
  ],
  "scripts": {
    "dev": "npm run dev --workspace=prismgb-app",
    "build": "npm run build --workspace=prismgb-gpu && npm run build --workspace=prismgb-app",
    "test": "npm run test --workspaces --if-present",
    "test:run": "npm run test:run --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present"
  }
}
```

**Step 2: Create shared TypeScript base config**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "exactOptionalPropertyTypes": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

**Step 3: Verify workspace setup**

Run: `npm install` (from workspace root)
Expected: Clean install with workspace linking

**Step 4: Commit**

```bash
git add package.json tsconfig.base.json
git commit -m "build: configure npm workspaces and shared TypeScript config"
```

---

### Task 0.2: Add TypeScript to prismgb-app

**Files:**
- Create: `prismgb-app/tsconfig.json`
- Modify: `prismgb-app/package.json`
- Modify: `prismgb-app/vite.config.js` → `vite.config.ts`

**Step 1: Install TypeScript dependencies**

```bash
cd prismgb-app
npm install -D typescript @types/node
```

**Step 2: Create prismgb-app tsconfig.json**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@core/*": ["src/core/*"],
      "@main/*": ["src/main/*"],
      "@renderer/*": ["src/renderer/*"],
      "@preload/*": ["src/preload/*"],
      "@shared/*": ["src/shared/*"]
    },
    "types": ["node", "vite/client"],
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 3: Update package.json scripts for TypeScript**

Add to `prismgb-app/package.json`:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

**Step 4: Run typecheck to verify setup**

Run: `npm run typecheck`
Expected: May have errors (JS files not checked), but TypeScript is configured

**Step 5: Commit**

```bash
git add tsconfig.json package.json package-lock.json
git commit -m "build(app): add TypeScript configuration"
```

---

## Phase 1: Extract Core Package

### Task 1.1: Create Core Directory Structure

**Files:**
- Create: `src/core/index.ts`
- Create: `src/core/base/index.ts`
- Create: `src/core/interfaces/index.ts`
- Create: `src/core/domain/index.ts`
- Create: `src/core/ipc/index.ts`
- Create: `src/core/errors/index.ts`

**Step 1: Create directory structure**

```bash
mkdir -p src/core/{base,interfaces/{adapters,services,infrastructure},domain/{devices/profiles,transcode/formats},ipc/contracts,errors}
```

**Step 2: Create barrel exports**

Create `src/core/index.ts`:

```typescript
// Core package - process-agnostic contracts and domain
export * from './base';
export * from './interfaces';
export * from './domain';
export * from './ipc';
export * from './errors';
```

Create `src/core/base/index.ts`:

```typescript
export { BaseService } from './service.base';
export { BaseOrchestrator } from './orchestrator.base';
export type { IDisposable } from './disposable.interface';
```

Create `src/core/interfaces/index.ts`:

```typescript
export * from './adapters';
export * from './services';
export * from './infrastructure';
```

**Step 3: Verify directory exists**

Run: `ls -la src/core/`
Expected: All directories created

**Step 4: Commit**

```bash
git add src/core/
git commit -m "feat(core): create core package directory structure"
```

---

### Task 1.2: Create IDisposable Interface

**Files:**
- Create: `src/core/base/disposable.interface.ts`
- Test: `tests/unit/core/base/disposable.interface.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/core/base/disposable.interface.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { IDisposable } from '@core/base/disposable.interface';

describe('IDisposable', () => {
  it('should define dispose method signature', () => {
    const disposable: IDisposable = {
      dispose: () => {}
    };

    expect(typeof disposable.dispose).toBe('function');
  });

  it('should allow async dispose', async () => {
    const disposable: IDisposable = {
      dispose: async () => {
        await Promise.resolve();
      }
    };

    await expect(disposable.dispose()).resolves.toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/core/base/disposable.interface.test.ts`
Expected: FAIL - Cannot find module '@core/base/disposable.interface'

**Step 3: Write implementation**

Create `src/core/base/disposable.interface.ts`:

```typescript
/**
 * Interface for objects that hold resources requiring cleanup.
 * Implementers must release resources when dispose() is called.
 */
export interface IDisposable {
  /**
   * Release all resources held by this object.
   * After calling dispose(), the object should not be used.
   */
  dispose(): void | Promise<void>;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/core/base/disposable.interface.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/base/disposable.interface.ts tests/unit/core/base/disposable.interface.test.ts
git commit -m "feat(core): add IDisposable interface"
```

---

### Task 1.3: Migrate BaseService to TypeScript

**Files:**
- Create: `src/core/base/service.base.ts`
- Create: `src/core/base/validate-deps.utils.ts`
- Test: `tests/unit/core/base/service.base.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/core/base/service.base.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { BaseService } from '@core/base/service.base';

describe('BaseService', () => {
  describe('constructor', () => {
    it('should validate required dependencies', () => {
      expect(() => {
        new BaseService({}, ['eventBus'], 'TestService');
      }).toThrow('TestService: missing required dependency: eventBus');
    });

    it('should assign required dependencies to instance', () => {
      const mockEventBus = { publish: vi.fn() };
      const service = new BaseService(
        { eventBus: mockEventBus },
        ['eventBus'],
        'TestService'
      );

      expect((service as any).eventBus).toBe(mockEventBus);
    });

    it('should create logger if loggerFactory provided', () => {
      const mockLogger = { info: vi.fn() };
      const mockLoggerFactory = { create: vi.fn().mockReturnValue(mockLogger) };

      const service = new BaseService(
        { loggerFactory: mockLoggerFactory },
        [],
        'TestService'
      );

      expect(mockLoggerFactory.create).toHaveBeenCalledWith('TestService');
      expect((service as any).logger).toBe(mockLogger);
    });

    it('should use constructor name if serviceName not provided', () => {
      class MyService extends BaseService {
        constructor() {
          super({}, [], null);
        }
      }

      const service = new MyService();
      expect((service as any)._serviceName).toBe('MyService');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/core/base/service.base.test.ts`
Expected: FAIL - Cannot find module '@core/base/service.base'

**Step 3: Write validate-deps utility**

Create `src/core/base/validate-deps.utils.ts`:

```typescript
/**
 * Validate that all required dependencies are present.
 * @throws Error if any required dependency is missing
 */
export function validateDependencies(
  dependencies: Record<string, unknown>,
  requiredDeps: string[],
  serviceName: string
): void {
  for (const dep of requiredDeps) {
    if (dependencies[dep] === undefined || dependencies[dep] === null) {
      throw new Error(`${serviceName}: missing required dependency: ${dep}`);
    }
  }
}
```

**Step 4: Write BaseService implementation**

Create `src/core/base/service.base.ts`:

```typescript
import { validateDependencies } from './validate-deps.utils';

/**
 * Logger interface expected by BaseService.
 */
export interface ILogger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

/**
 * LoggerFactory interface expected by BaseService.
 */
export interface ILoggerFactory {
  create(name: string): ILogger;
}

/**
 * Dependencies object type for BaseService.
 */
export interface BaseServiceDependencies {
  loggerFactory?: ILoggerFactory;
  [key: string]: unknown;
}

/**
 * Base class for all services providing:
 * - Dependency injection and validation
 * - Logger creation and management
 */
export class BaseService {
  protected logger?: ILogger;
  protected readonly _serviceName: string;

  /**
   * Create a new service
   * @param dependencies - Dependency injection object
   * @param requiredDeps - Array of required dependency names
   * @param serviceName - Name of the service (for logging)
   */
  constructor(
    dependencies: BaseServiceDependencies,
    requiredDeps: string[] = [],
    serviceName: string | null = null
  ) {
    const name = serviceName ?? this.constructor.name;
    validateDependencies(dependencies, requiredDeps, name);

    // Explicitly assign only required dependencies
    for (const dep of requiredDeps) {
      (this as any)[dep] = dependencies[dep];
    }

    // Create logger if loggerFactory provided
    if (dependencies.loggerFactory) {
      this.logger = dependencies.loggerFactory.create(name);
    }

    this._serviceName = name;
  }
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/core/base/service.base.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/core/base/service.base.ts src/core/base/validate-deps.utils.ts tests/unit/core/base/service.base.test.ts
git commit -m "feat(core): migrate BaseService to TypeScript"
```

---

### Task 1.4: Migrate BaseOrchestrator to TypeScript

**Files:**
- Create: `src/core/base/orchestrator.base.ts`
- Test: `tests/unit/core/base/orchestrator.base.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/core/base/orchestrator.base.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseOrchestrator } from '@core/base/orchestrator.base';

describe('BaseOrchestrator', () => {
  let mockEventBus: any;
  let mockLoggerFactory: any;

  beforeEach(() => {
    mockEventBus = {
      subscribe: vi.fn().mockReturnValue(vi.fn()),
      publish: vi.fn()
    };
    mockLoggerFactory = {
      create: vi.fn().mockReturnValue({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
      })
    };
  });

  describe('lifecycle', () => {
    it('should track initialization state', async () => {
      class TestOrchestrator extends BaseOrchestrator {
        protected async onInitialize(): Promise<void> {}
        protected async onCleanup(): Promise<void> {}
      }

      const orchestrator = new TestOrchestrator(
        { eventBus: mockEventBus, loggerFactory: mockLoggerFactory },
        ['eventBus'],
        'TestOrchestrator'
      );

      expect(orchestrator.isInitialized).toBe(false);
      await orchestrator.initialize();
      expect(orchestrator.isInitialized).toBe(true);
    });

    it('should call onInitialize during initialize()', async () => {
      const onInitializeSpy = vi.fn();

      class TestOrchestrator extends BaseOrchestrator {
        protected async onInitialize(): Promise<void> {
          onInitializeSpy();
        }
        protected async onCleanup(): Promise<void> {}
      }

      const orchestrator = new TestOrchestrator(
        { eventBus: mockEventBus, loggerFactory: mockLoggerFactory },
        ['eventBus'],
        'TestOrchestrator'
      );

      await orchestrator.initialize();
      expect(onInitializeSpy).toHaveBeenCalled();
    });

    it('should call onCleanup during cleanup()', async () => {
      const onCleanupSpy = vi.fn();

      class TestOrchestrator extends BaseOrchestrator {
        protected async onInitialize(): Promise<void> {}
        protected async onCleanup(): Promise<void> {
          onCleanupSpy();
        }
      }

      const orchestrator = new TestOrchestrator(
        { eventBus: mockEventBus, loggerFactory: mockLoggerFactory },
        ['eventBus'],
        'TestOrchestrator'
      );

      await orchestrator.initialize();
      await orchestrator.cleanup();
      expect(onCleanupSpy).toHaveBeenCalled();
    });
  });

  describe('subscribeWithCleanup', () => {
    it('should track subscriptions for cleanup', async () => {
      const unsubscribe = vi.fn();
      mockEventBus.subscribe.mockReturnValue(unsubscribe);

      class TestOrchestrator extends BaseOrchestrator {
        protected async onInitialize(): Promise<void> {
          this.subscribeWithCleanup({
            'test:event': () => {}
          });
        }
        protected async onCleanup(): Promise<void> {}
      }

      const orchestrator = new TestOrchestrator(
        { eventBus: mockEventBus, loggerFactory: mockLoggerFactory },
        ['eventBus'],
        'TestOrchestrator'
      );

      await orchestrator.initialize();
      await orchestrator.cleanup();

      expect(unsubscribe).toHaveBeenCalled();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/core/base/orchestrator.base.test.ts`
Expected: FAIL - Cannot find module '@core/base/orchestrator.base'

**Step 3: Write implementation**

Create `src/core/base/orchestrator.base.ts`:

```typescript
import { BaseService, BaseServiceDependencies } from './service.base';
import type { IDisposable } from './disposable.interface';

/**
 * EventBus interface expected by BaseOrchestrator.
 */
export interface IEventBus {
  subscribe(event: string, handler: (...args: unknown[]) => void): () => void;
  publish(event: string, ...args: unknown[]): void;
}

/**
 * Dependencies required by BaseOrchestrator.
 */
export interface BaseOrchestratorDependencies extends BaseServiceDependencies {
  eventBus?: IEventBus;
}

/**
 * Event subscription map for subscribeWithCleanup.
 */
export type EventSubscriptionMap = Record<string, (...args: unknown[]) => void>;

/**
 * Base class for orchestrators providing:
 * - Lifecycle management (initialize/cleanup)
 * - Event subscription tracking with automatic cleanup
 */
export abstract class BaseOrchestrator extends BaseService implements IDisposable {
  private _isInitialized = false;
  private _isCleanedUp = false;
  private readonly _subscriptions: Array<() => void> = [];

  protected eventBus?: IEventBus;

  constructor(
    dependencies: BaseOrchestratorDependencies,
    requiredDeps: string[] = [],
    name: string
  ) {
    super(dependencies, requiredDeps, name);
    this.eventBus = dependencies.eventBus;
  }

  /**
   * Whether the orchestrator has been initialized.
   */
  get isInitialized(): boolean {
    return this._isInitialized;
  }

  /**
   * Initialize the orchestrator.
   * Calls onInitialize() for subclass-specific initialization.
   */
  async initialize(): Promise<void> {
    if (this._isInitialized) {
      this.logger?.warn(`${this._serviceName} already initialized`);
      return;
    }

    this.logger?.debug(`Initializing ${this._serviceName}`);
    await this.onInitialize();
    this._isInitialized = true;
    this.logger?.debug(`${this._serviceName} initialized`);
  }

  /**
   * Cleanup the orchestrator.
   * Unsubscribes all tracked subscriptions and calls onCleanup().
   */
  async cleanup(): Promise<void> {
    if (this._isCleanedUp) {
      return;
    }

    this.logger?.debug(`Cleaning up ${this._serviceName}`);

    // Unsubscribe all tracked subscriptions
    for (const unsubscribe of this._subscriptions) {
      try {
        unsubscribe();
      } catch (error) {
        this.logger?.error(`Error unsubscribing in ${this._serviceName}`, error);
      }
    }
    this._subscriptions.length = 0;

    await this.onCleanup();
    this._isCleanedUp = true;
    this._isInitialized = false;
    this.logger?.debug(`${this._serviceName} cleaned up`);
  }

  /**
   * Alias for cleanup() to satisfy IDisposable.
   */
  async dispose(): Promise<void> {
    await this.cleanup();
  }

  /**
   * Subscribe to multiple events with automatic cleanup tracking.
   * @param eventMap - Map of event names to handlers
   */
  protected subscribeWithCleanup(eventMap: EventSubscriptionMap): void {
    if (!this.eventBus) {
      this.logger?.warn(`${this._serviceName}: No eventBus available for subscriptions`);
      return;
    }

    for (const [event, handler] of Object.entries(eventMap)) {
      const unsubscribe = this.eventBus.subscribe(event, handler);
      this._subscriptions.push(unsubscribe);
    }
  }

  /**
   * Override in subclass for custom initialization logic.
   */
  protected abstract onInitialize(): Promise<void>;

  /**
   * Override in subclass for custom cleanup logic.
   */
  protected abstract onCleanup(): Promise<void>;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/core/base/orchestrator.base.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/base/orchestrator.base.ts tests/unit/core/base/orchestrator.base.test.ts
git commit -m "feat(core): migrate BaseOrchestrator to TypeScript"
```

---

### Task 1.5: Create Infrastructure Interfaces

**Files:**
- Create: `src/core/interfaces/infrastructure/event-bus.interface.ts`
- Create: `src/core/interfaces/infrastructure/logger.interface.ts`
- Create: `src/core/interfaces/infrastructure/service-container.interface.ts`
- Create: `src/core/interfaces/infrastructure/index.ts`

**Step 1: Create IEventBus interface**

Create `src/core/interfaces/infrastructure/event-bus.interface.ts`:

```typescript
/**
 * Event handler function type.
 */
export type EventHandler<T = unknown> = (payload: T) => void;

/**
 * Unsubscribe function returned by subscribe.
 */
export type Unsubscribe = () => void;

/**
 * Interface for event bus implementations.
 * Provides publish/subscribe pattern for cross-service communication.
 */
export interface IEventBus {
  /**
   * Subscribe to an event.
   * @param event - Event name to subscribe to
   * @param handler - Handler function called when event is published
   * @returns Unsubscribe function to remove the subscription
   */
  subscribe<T = unknown>(event: string, handler: EventHandler<T>): Unsubscribe;

  /**
   * Publish an event to all subscribers.
   * @param event - Event name to publish
   * @param payload - Data to pass to handlers
   */
  publish<T = unknown>(event: string, payload?: T): void;

  /**
   * Remove all subscriptions for a specific event.
   * @param event - Event name to clear
   */
  removeAllListeners(event?: string): void;
}
```

**Step 2: Create ILogger interfaces**

Create `src/core/interfaces/infrastructure/logger.interface.ts`:

```typescript
/**
 * Log level enum.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Interface for logger implementations.
 */
export interface ILogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Interface for logger factory.
 */
export interface ILoggerFactory {
  /**
   * Create a new logger instance with the given name.
   * @param name - Logger name (typically service/class name)
   */
  create(name: string): ILogger;
}
```

**Step 3: Create IServiceContainer interface**

Create `src/core/interfaces/infrastructure/service-container.interface.ts`:

```typescript
/**
 * Service factory function type.
 */
export type ServiceFactory<T> = (container: IServiceContainer) => T;

/**
 * Interface for dependency injection container.
 */
export interface IServiceContainer {
  /**
   * Register a singleton service.
   * @param name - Service identifier
   * @param implementation - Class constructor or factory
   * @param dependencies - Array of dependency names to inject
   */
  registerSingleton<T>(
    name: string,
    implementation: new (...args: unknown[]) => T,
    dependencies?: string[]
  ): void;

  /**
   * Register a plain value.
   * @param name - Value identifier
   * @param value - Value to register
   */
  registerValue<T>(name: string, value: T): void;

  /**
   * Register a factory function.
   * @param name - Factory identifier
   * @param factory - Factory function
   */
  registerFactory<T>(name: string, factory: ServiceFactory<T>): void;

  /**
   * Resolve a service by name.
   * @param name - Service identifier
   */
  resolve<T>(name: string): T;

  /**
   * Check if a service is registered.
   * @param name - Service identifier
   */
  has(name: string): boolean;
}
```

**Step 4: Create barrel export**

Create `src/core/interfaces/infrastructure/index.ts`:

```typescript
export type {
  IEventBus,
  EventHandler,
  Unsubscribe
} from './event-bus.interface';

export type {
  ILogger,
  ILoggerFactory,
  LogLevel
} from './logger.interface';

export type {
  IServiceContainer,
  ServiceFactory
} from './service-container.interface';
```

**Step 5: Commit**

```bash
git add src/core/interfaces/infrastructure/
git commit -m "feat(core): add infrastructure interfaces (IEventBus, ILogger, IServiceContainer)"
```

---

### Task 1.6: Create Adapter Interfaces

**Files:**
- Create: `src/core/interfaces/adapters/device-adapter.interface.ts`
- Create: `src/core/interfaces/adapters/storage-adapter.interface.ts`
- Create: `src/core/interfaces/adapters/media-adapter.interface.ts`
- Create: `src/core/interfaces/adapters/index.ts`

**Step 1: Create IDeviceAdapter interface**

Create `src/core/interfaces/adapters/device-adapter.interface.ts`:

```typescript
import type { IDisposable } from '../../base/disposable.interface';

/**
 * Device information passed to adapter initialization.
 */
export interface DeviceInfo {
  deviceId: string;
  groupId?: string;
  label?: string;
}

/**
 * Device capabilities returned by adapter.
 */
export interface DeviceCapabilities {
  maxWidth: number;
  maxHeight: number;
  maxFrameRate: number;
  supportedFormats?: string[];
}

/**
 * Device profile containing device-specific configuration.
 */
export interface IDeviceProfile {
  readonly name: string;
  readonly vendorId: number;
  readonly productId: number;
  readonly nativeWidth: number;
  readonly nativeHeight: number;
  readonly frameRate: number;
}

/**
 * Options for stream acquisition.
 */
export interface StreamOptions {
  width?: number;
  height?: number;
  frameRate?: number;
}

/**
 * Interface for device adapters.
 * Adapters handle device-specific stream acquisition and capabilities.
 */
export interface IDeviceAdapter extends IDisposable {
  /**
   * Initialize the adapter with device information.
   */
  initialize(deviceInfo: DeviceInfo): Promise<void>;

  /**
   * Get a media stream from the device.
   */
  getStream(options?: StreamOptions): Promise<MediaStream>;

  /**
   * Release the current stream.
   */
  releaseStream(stream: MediaStream): Promise<void>;

  /**
   * Get device capabilities.
   */
  getCapabilities(): DeviceCapabilities;

  /**
   * Get device profile.
   */
  getProfile(): IDeviceProfile;
}
```

**Step 2: Create IStorageAdapter interface**

Create `src/core/interfaces/adapters/storage-adapter.interface.ts`:

```typescript
/**
 * Interface for storage adapters.
 * Abstracts localStorage/sessionStorage or other storage backends.
 */
export interface IStorageAdapter {
  /**
   * Get a value from storage.
   * @param key - Storage key
   * @returns Stored value or null if not found
   */
  get<T>(key: string): T | null;

  /**
   * Set a value in storage.
   * @param key - Storage key
   * @param value - Value to store
   */
  set<T>(key: string, value: T): void;

  /**
   * Remove a value from storage.
   * @param key - Storage key
   */
  remove(key: string): void;

  /**
   * Check if a key exists in storage.
   * @param key - Storage key
   */
  has(key: string): boolean;

  /**
   * Clear all stored values.
   */
  clear(): void;
}
```

**Step 3: Create IMediaAdapter interface**

Create `src/core/interfaces/adapters/media-adapter.interface.ts`:

```typescript
/**
 * Media device information.
 */
export interface MediaDeviceInfo {
  deviceId: string;
  groupId: string;
  kind: 'videoinput' | 'audioinput' | 'audiooutput';
  label: string;
}

/**
 * Interface for browser media API adapters.
 */
export interface IMediaAdapter {
  /**
   * Enumerate available media devices.
   */
  enumerateDevices(): Promise<MediaDeviceInfo[]>;

  /**
   * Get user media stream with constraints.
   */
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;

  /**
   * Check if getUserMedia is supported.
   */
  isSupported(): boolean;
}
```

**Step 4: Create barrel export**

Create `src/core/interfaces/adapters/index.ts`:

```typescript
export type {
  IDeviceAdapter,
  DeviceInfo,
  DeviceCapabilities,
  IDeviceProfile,
  StreamOptions
} from './device-adapter.interface';

export type { IStorageAdapter } from './storage-adapter.interface';

export type {
  IMediaAdapter,
  MediaDeviceInfo
} from './media-adapter.interface';
```

**Step 5: Commit**

```bash
git add src/core/interfaces/adapters/
git commit -m "feat(core): add adapter interfaces (IDeviceAdapter, IStorageAdapter, IMediaAdapter)"
```

---

### Task 1.7: Create Service Interfaces

**Files:**
- Create: `src/core/interfaces/services/device-service.interface.ts`
- Create: `src/core/interfaces/services/capture-service.interface.ts`
- Create: `src/core/interfaces/services/settings-service.interface.ts`
- Create: `src/core/interfaces/services/transcode-service.interface.ts`
- Create: `src/core/interfaces/services/index.ts`

**Step 1: Create IDeviceService interface**

Create `src/core/interfaces/services/device-service.interface.ts`:

```typescript
import type { MediaDeviceInfo } from '../adapters/media-adapter.interface';

/**
 * Device connection status.
 */
export interface DeviceConnectionStatus {
  connected: boolean;
  deviceId?: string;
  label?: string;
}

/**
 * Interface for device service.
 */
export interface IDeviceService {
  /**
   * Get current connection status.
   */
  getConnectionStatus(): Promise<DeviceConnectionStatus>;

  /**
   * Get available video input devices.
   */
  getVideoDevices(): Promise<MediaDeviceInfo[]>;

  /**
   * Get the currently selected device ID.
   */
  getSelectedDeviceId(): string | null;

  /**
   * Set the selected device ID.
   */
  setSelectedDeviceId(deviceId: string): void;

  /**
   * Check if a supported device is available.
   */
  hasSupportedDevice(): Promise<boolean>;
}
```

**Step 2: Create ICaptureService interface**

Create `src/core/interfaces/services/capture-service.interface.ts`:

```typescript
/**
 * Screenshot result.
 */
export interface ScreenshotResult {
  blob: Blob;
  filename: string;
  timestamp: number;
}

/**
 * Recording state.
 */
export type RecordingState = 'idle' | 'recording' | 'stopping';

/**
 * Recording result.
 */
export interface RecordingResult {
  blob: Blob;
  filename: string;
  duration: number;
  timestamp: number;
}

/**
 * Interface for capture service.
 */
export interface ICaptureService {
  /**
   * Take a screenshot.
   */
  takeScreenshot(): Promise<ScreenshotResult>;

  /**
   * Start video recording.
   */
  startRecording(): Promise<void>;

  /**
   * Stop video recording.
   */
  stopRecording(): Promise<RecordingResult>;

  /**
   * Get current recording state.
   */
  getRecordingState(): RecordingState;

  /**
   * Check if recording is in progress.
   */
  isRecording(): boolean;
}
```

**Step 3: Create ISettingsService interface**

Create `src/core/interfaces/services/settings-service.interface.ts`:

```typescript
/**
 * Recording format options.
 */
export type RecordingFormat = 'webm' | 'mp4' | 'mov';

/**
 * Application settings.
 */
export interface AppSettings {
  volume: number;
  brightness: number;
  renderPreset: string;
  recordingFormat: RecordingFormat;
  performanceMode: boolean;
  cinematicMode: boolean;
  minimalistFullscreen: boolean;
}

/**
 * Interface for settings service.
 */
export interface ISettingsService {
  /**
   * Get a setting value.
   */
  get<K extends keyof AppSettings>(key: K): AppSettings[K];

  /**
   * Set a setting value.
   */
  set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void;

  /**
   * Get all settings.
   */
  getAll(): AppSettings;

  /**
   * Reset all settings to defaults.
   */
  reset(): void;

  /**
   * Load settings from storage.
   */
  load(): void;

  /**
   * Save settings to storage.
   */
  save(): void;
}
```

**Step 4: Create ITranscodeService interface**

Create `src/core/interfaces/services/transcode-service.interface.ts`:

```typescript
/**
 * Transcode format.
 */
export type TranscodeFormat = 'webm' | 'mp4' | 'mov' | 'gif';

/**
 * Transcode options.
 */
export interface TranscodeOptions {
  inputPath: string;
  outputPath: string;
  format: TranscodeFormat;
  quality?: 'low' | 'medium' | 'high';
}

/**
 * Transcode progress.
 */
export interface TranscodeProgress {
  percent: number;
  frame?: number;
  fps?: number;
  time?: string;
}

/**
 * Transcode result.
 */
export interface TranscodeResult {
  success: boolean;
  outputPath: string;
  duration: number;
  error?: string;
}

/**
 * Interface for transcode service.
 */
export interface ITranscodeService {
  /**
   * Start transcoding a file.
   */
  start(options: TranscodeOptions): Promise<void>;

  /**
   * Cancel current transcode operation.
   */
  cancel(): Promise<void>;

  /**
   * Get current transcode status.
   */
  getStatus(): TranscodeProgress | null;

  /**
   * Check if transcoding is in progress.
   */
  isTranscoding(): boolean;
}
```

**Step 5: Create barrel export**

Create `src/core/interfaces/services/index.ts`:

```typescript
export type {
  IDeviceService,
  DeviceConnectionStatus
} from './device-service.interface';

export type {
  ICaptureService,
  ScreenshotResult,
  RecordingState,
  RecordingResult
} from './capture-service.interface';

export type {
  ISettingsService,
  AppSettings,
  RecordingFormat
} from './settings-service.interface';

export type {
  ITranscodeService,
  TranscodeFormat,
  TranscodeOptions,
  TranscodeProgress,
  TranscodeResult
} from './transcode-service.interface';
```

**Step 6: Commit**

```bash
git add src/core/interfaces/services/
git commit -m "feat(core): add service interfaces (IDeviceService, ICaptureService, ISettingsService, ITranscodeService)"
```

---

### Task 1.8: Migrate IPC Channels and Contracts

**Files:**
- Create: `src/core/ipc/channels.ts`
- Create: `src/core/ipc/contracts/device-ipc.contract.ts`
- Create: `src/core/ipc/contracts/window-ipc.contract.ts`
- Create: `src/core/ipc/contracts/update-ipc.contract.ts`
- Create: `src/core/ipc/contracts/transcode-ipc.contract.ts`
- Create: `src/core/ipc/contracts/index.ts`
- Create: `src/core/ipc/index.ts`

**Step 1: Create typed channels**

Create `src/core/ipc/channels.ts`:

```typescript
/**
 * IPC channel constants.
 * Single source of truth for all IPC communication channels.
 */
export const IPC_CHANNELS = {
  DEVICE: {
    GET_STATUS: 'device:get-status',
    CONNECTED: 'device:connected',
    DISCONNECTED: 'device:disconnected'
  },
  GPU: {
    GET_POLICY: 'gpu:get-policy'
  },
  SHELL: {
    OPEN_EXTERNAL: 'shell:open-external'
  },
  WINDOW: {
    ENTER_FULLSCREEN: 'window:enter-fullscreen',
    LEAVE_FULLSCREEN: 'window:leave-fullscreen',
    RESIZED: 'window:resized',
    SET_FULLSCREEN: 'window:set-fullscreen',
    IS_FULLSCREEN: 'window:is-fullscreen'
  },
  UPDATE: {
    CHECK: 'update:check',
    DOWNLOAD: 'update:download',
    INSTALL: 'update:install',
    GET_STATUS: 'update:get-status',
    AVAILABLE: 'update:available',
    NOT_AVAILABLE: 'update:not-available',
    PROGRESS: 'update:progress',
    DOWNLOADED: 'update:downloaded',
    ERROR: 'update:error'
  },
  PERFORMANCE: {
    GET_METRICS: 'performance:get-metrics'
  },
  TRANSCODE: {
    START: 'transcode:start',
    CANCEL: 'transcode:cancel',
    GET_STATUS: 'transcode:get-status',
    PROGRESS: 'transcode:progress',
    COMPLETED: 'transcode:completed',
    ERROR: 'transcode:error',
    CANCELLED: 'transcode:cancelled'
  }
} as const;

/**
 * Type helper to extract channel string values.
 */
export type IPCChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS][keyof typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS]];
```

**Step 2: Create device IPC contract**

Create `src/core/ipc/contracts/device-ipc.contract.ts`:

```typescript
/**
 * Device status returned by GET_STATUS channel.
 */
export interface DeviceStatusResponse {
  connected: boolean;
  vendorId?: number;
  productId?: number;
  deviceName?: string;
}

/**
 * Device connected event payload.
 */
export interface DeviceConnectedPayload {
  vendorId: number;
  productId: number;
  deviceName: string;
}

/**
 * Device disconnected event payload.
 */
export interface DeviceDisconnectedPayload {
  vendorId: number;
  productId: number;
}
```

**Step 3: Create window IPC contract**

Create `src/core/ipc/contracts/window-ipc.contract.ts`:

```typescript
/**
 * Window resize event payload.
 */
export interface WindowResizedPayload {
  width: number;
  height: number;
}

/**
 * Set fullscreen request payload.
 */
export interface SetFullscreenRequest {
  fullscreen: boolean;
}

/**
 * Is fullscreen response.
 */
export interface IsFullscreenResponse {
  fullscreen: boolean;
}
```

**Step 4: Create update IPC contract**

Create `src/core/ipc/contracts/update-ipc.contract.ts`:

```typescript
/**
 * Update status.
 */
export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';

/**
 * Update info for available update.
 */
export interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
}

/**
 * Update download progress.
 */
export interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

/**
 * Update error payload.
 */
export interface UpdateError {
  message: string;
  code?: string;
}

/**
 * Get status response.
 */
export interface UpdateStatusResponse {
  status: UpdateStatus;
  info?: UpdateInfo;
  error?: UpdateError;
}
```

**Step 5: Create transcode IPC contract**

Create `src/core/ipc/contracts/transcode-ipc.contract.ts`:

```typescript
/**
 * Transcode start request.
 */
export interface TranscodeStartRequest {
  inputPath: string;
  outputPath: string;
  format: 'webm' | 'mp4' | 'mov' | 'gif';
  quality?: 'low' | 'medium' | 'high';
}

/**
 * Transcode progress event payload.
 */
export interface TranscodeProgressPayload {
  percent: number;
  frame?: number;
  fps?: number;
  time?: string;
}

/**
 * Transcode completed event payload.
 */
export interface TranscodeCompletedPayload {
  outputPath: string;
  duration: number;
}

/**
 * Transcode error event payload.
 */
export interface TranscodeErrorPayload {
  message: string;
  code?: string;
}

/**
 * Transcode status response.
 */
export interface TranscodeStatusResponse {
  active: boolean;
  progress?: TranscodeProgressPayload;
}
```

**Step 6: Create barrel exports**

Create `src/core/ipc/contracts/index.ts`:

```typescript
export type {
  DeviceStatusResponse,
  DeviceConnectedPayload,
  DeviceDisconnectedPayload
} from './device-ipc.contract';

export type {
  WindowResizedPayload,
  SetFullscreenRequest,
  IsFullscreenResponse
} from './window-ipc.contract';

export type {
  UpdateStatus,
  UpdateInfo,
  UpdateProgress,
  UpdateError,
  UpdateStatusResponse
} from './update-ipc.contract';

export type {
  TranscodeStartRequest,
  TranscodeProgressPayload,
  TranscodeCompletedPayload,
  TranscodeErrorPayload,
  TranscodeStatusResponse
} from './transcode-ipc.contract';
```

Create `src/core/ipc/index.ts`:

```typescript
export { IPC_CHANNELS, type IPCChannel } from './channels';
export * from './contracts';
```

**Step 7: Commit**

```bash
git add src/core/ipc/
git commit -m "feat(core): add IPC channels and typed contracts"
```

---

### Task 1.9: Create Error Types

**Files:**
- Create: `src/core/errors/error-codes.enum.ts`
- Create: `src/core/errors/app-error.ts`
- Create: `src/core/errors/index.ts`
- Test: `tests/unit/core/errors/app-error.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/core/errors/app-error.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { AppError, ErrorCode } from '@core/errors';

describe('AppError', () => {
  it('should create error with code and message', () => {
    const error = new AppError(ErrorCode.DEVICE_NOT_FOUND, 'Device not found');

    expect(error.code).toBe(ErrorCode.DEVICE_NOT_FOUND);
    expect(error.message).toBe('Device not found');
    expect(error.name).toBe('AppError');
  });

  it('should include cause if provided', () => {
    const cause = new Error('Original error');
    const error = new AppError(ErrorCode.STREAM_ERROR, 'Stream failed', cause);

    expect(error.cause).toBe(cause);
  });

  it('should be instanceof Error', () => {
    const error = new AppError(ErrorCode.UNKNOWN, 'Unknown error');

    expect(error instanceof Error).toBe(true);
    expect(error instanceof AppError).toBe(true);
  });

  it('should format error label correctly', () => {
    const error = new AppError(ErrorCode.DEVICE_NOT_FOUND, 'Device not found');

    expect(error.toLabel()).toBe('[DEVICE_NOT_FOUND] Device not found');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/core/errors/app-error.test.ts`
Expected: FAIL - Cannot find module '@core/errors'

**Step 3: Create error codes enum**

Create `src/core/errors/error-codes.enum.ts`:

```typescript
/**
 * Application error codes.
 */
export enum ErrorCode {
  // General
  UNKNOWN = 'UNKNOWN',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',

  // Device errors
  DEVICE_NOT_FOUND = 'DEVICE_NOT_FOUND',
  DEVICE_ACCESS_DENIED = 'DEVICE_ACCESS_DENIED',
  DEVICE_BUSY = 'DEVICE_BUSY',
  DEVICE_DISCONNECTED = 'DEVICE_DISCONNECTED',

  // Stream errors
  STREAM_ERROR = 'STREAM_ERROR',
  STREAM_ACQUISITION_FAILED = 'STREAM_ACQUISITION_FAILED',
  STREAM_TIMEOUT = 'STREAM_TIMEOUT',

  // Capture errors
  CAPTURE_FAILED = 'CAPTURE_FAILED',
  RECORDING_FAILED = 'RECORDING_FAILED',

  // Transcode errors
  TRANSCODE_FAILED = 'TRANSCODE_FAILED',
  TRANSCODE_CANCELLED = 'TRANSCODE_CANCELLED',

  // GPU errors
  GPU_NOT_SUPPORTED = 'GPU_NOT_SUPPORTED',
  GPU_CONTEXT_LOST = 'GPU_CONTEXT_LOST',
  SHADER_COMPILATION_FAILED = 'SHADER_COMPILATION_FAILED',

  // IPC errors
  IPC_ERROR = 'IPC_ERROR',
  IPC_TIMEOUT = 'IPC_TIMEOUT'
}
```

**Step 4: Create AppError class**

Create `src/core/errors/app-error.ts`:

```typescript
import { ErrorCode } from './error-codes.enum';

/**
 * Application-specific error with error code.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly cause?: Error;

  constructor(code: ErrorCode, message: string, cause?: Error) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.cause = cause;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  /**
   * Format error as a label string.
   */
  toLabel(): string {
    return `[${this.code}] ${this.message}`;
  }

  /**
   * Create error from unknown value (for catch blocks).
   */
  static from(error: unknown, fallbackCode: ErrorCode = ErrorCode.UNKNOWN): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof Error) {
      return new AppError(fallbackCode, error.message, error);
    }

    return new AppError(fallbackCode, String(error));
  }
}
```

**Step 5: Create barrel export**

Create `src/core/errors/index.ts`:

```typescript
export { ErrorCode } from './error-codes.enum';
export { AppError } from './app-error';
```

**Step 6: Run test to verify it passes**

Run: `npx vitest run tests/unit/core/errors/app-error.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add src/core/errors/ tests/unit/core/errors/
git commit -m "feat(core): add error types (AppError, ErrorCode)"
```

---

### Task 1.10: Migrate Device Domain Entities

**Files:**
- Create: `src/core/domain/devices/device-profile.interface.ts`
- Create: `src/core/domain/devices/device-profile.base.ts`
- Create: `src/core/domain/devices/device-registry.ts`
- Create: `src/core/domain/devices/profiles/chromatic.profile.ts`
- Create: `src/core/domain/devices/index.ts`
- Test: `tests/unit/core/domain/devices/device-registry.test.ts`

**Step 1: Create device profile interface**

Create `src/core/domain/devices/device-profile.interface.ts`:

```typescript
/**
 * USB device identifiers.
 */
export interface UsbIdentifier {
  vendorId: number;
  productId: number;
}

/**
 * Display configuration.
 */
export interface DisplayConfig {
  nativeWidth: number;
  nativeHeight: number;
  frameRate: number;
  aspectRatio: string;
}

/**
 * Media constraints for stream acquisition.
 */
export interface MediaConstraintConfig {
  width: { ideal: number };
  height: { ideal: number };
  frameRate: { ideal: number };
}

/**
 * Interface for device profiles.
 */
export interface IDeviceProfile {
  readonly name: string;
  readonly usbIdentifiers: UsbIdentifier[];
  readonly display: DisplayConfig;

  /**
   * Get media constraints for stream acquisition.
   */
  getMediaConstraints(): MediaConstraintConfig;

  /**
   * Check if this profile matches a USB device.
   */
  matchesUsb(vendorId: number, productId: number): boolean;

  /**
   * Check if this profile matches a device label.
   */
  matchesLabel(label: string): boolean;
}
```

**Step 2: Create base device profile**

Create `src/core/domain/devices/device-profile.base.ts`:

```typescript
import type {
  IDeviceProfile,
  UsbIdentifier,
  DisplayConfig,
  MediaConstraintConfig
} from './device-profile.interface';

/**
 * Configuration for creating a device profile.
 */
export interface DeviceProfileConfig {
  name: string;
  usbIdentifiers: UsbIdentifier[];
  display: DisplayConfig;
  labelPatterns?: RegExp[];
}

/**
 * Base implementation of device profile.
 */
export abstract class DeviceProfile implements IDeviceProfile {
  readonly name: string;
  readonly usbIdentifiers: UsbIdentifier[];
  readonly display: DisplayConfig;
  protected readonly labelPatterns: RegExp[];

  constructor(config: DeviceProfileConfig) {
    this.name = config.name;
    this.usbIdentifiers = config.usbIdentifiers;
    this.display = config.display;
    this.labelPatterns = config.labelPatterns ?? [];
  }

  getMediaConstraints(): MediaConstraintConfig {
    return {
      width: { ideal: this.display.nativeWidth },
      height: { ideal: this.display.nativeHeight },
      frameRate: { ideal: this.display.frameRate }
    };
  }

  matchesUsb(vendorId: number, productId: number): boolean {
    return this.usbIdentifiers.some(
      (id) => id.vendorId === vendorId && id.productId === productId
    );
  }

  matchesLabel(label: string): boolean {
    if (!label) return false;
    const normalizedLabel = label.toLowerCase();
    return this.labelPatterns.some((pattern) => pattern.test(normalizedLabel));
  }
}
```

**Step 3: Create Chromatic profile**

Create `src/core/domain/devices/profiles/chromatic.profile.ts`:

```typescript
import { DeviceProfile } from '../device-profile.base';

/**
 * Chromatic USB identifiers.
 */
const CHROMATIC_USB = {
  VENDOR_ID: 0x374e,
  PRODUCT_ID: 0x0101
} as const;

/**
 * Chromatic display configuration.
 */
const CHROMATIC_DISPLAY = {
  nativeWidth: 160,
  nativeHeight: 144,
  frameRate: 60,
  aspectRatio: '10:9'
} as const;

/**
 * Device profile for Mod Retro Chromatic.
 */
export class ChromaticProfile extends DeviceProfile {
  constructor() {
    super({
      name: 'Mod Retro Chromatic',
      usbIdentifiers: [
        {
          vendorId: CHROMATIC_USB.VENDOR_ID,
          productId: CHROMATIC_USB.PRODUCT_ID
        }
      ],
      display: { ...CHROMATIC_DISPLAY },
      labelPatterns: [/chromatic/i, /mod\s*retro/i]
    });
  }
}

/**
 * Singleton instance of ChromaticProfile.
 */
export const chromaticProfile = new ChromaticProfile();
```

**Step 4: Create device registry**

Create `src/core/domain/devices/device-registry.ts`:

```typescript
import type { IDeviceProfile } from './device-profile.interface';
import { chromaticProfile } from './profiles/chromatic.profile';

/**
 * Registry of supported device profiles.
 */
export class DeviceRegistry {
  private static instance: DeviceRegistry;
  private readonly profiles: Map<string, IDeviceProfile> = new Map();

  private constructor() {
    // Register default profiles
    this.register(chromaticProfile);
  }

  /**
   * Get singleton instance.
   */
  static getInstance(): DeviceRegistry {
    if (!DeviceRegistry.instance) {
      DeviceRegistry.instance = new DeviceRegistry();
    }
    return DeviceRegistry.instance;
  }

  /**
   * Register a device profile.
   */
  register(profile: IDeviceProfile): void {
    this.profiles.set(profile.name, profile);
  }

  /**
   * Get a profile by name.
   */
  get(name: string): IDeviceProfile | undefined {
    return this.profiles.get(name);
  }

  /**
   * Get all registered profiles.
   */
  getAll(): IDeviceProfile[] {
    return Array.from(this.profiles.values());
  }

  /**
   * Find a profile matching USB identifiers.
   */
  findByUsb(vendorId: number, productId: number): IDeviceProfile | undefined {
    for (const profile of this.profiles.values()) {
      if (profile.matchesUsb(vendorId, productId)) {
        return profile;
      }
    }
    return undefined;
  }

  /**
   * Find a profile matching device label.
   */
  findByLabel(label: string): IDeviceProfile | undefined {
    for (const profile of this.profiles.values()) {
      if (profile.matchesLabel(label)) {
        return profile;
      }
    }
    return undefined;
  }

  /**
   * Check if a USB device is supported.
   */
  isSupported(vendorId: number, productId: number): boolean {
    return this.findByUsb(vendorId, productId) !== undefined;
  }
}

/**
 * Default device registry instance.
 */
export const deviceRegistry = DeviceRegistry.getInstance();
```

**Step 5: Write test for device registry**

Create `tests/unit/core/domain/devices/device-registry.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { DeviceRegistry, deviceRegistry } from '@core/domain/devices/device-registry';

describe('DeviceRegistry', () => {
  describe('singleton', () => {
    it('should return same instance', () => {
      const instance1 = DeviceRegistry.getInstance();
      const instance2 = DeviceRegistry.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('findByUsb', () => {
    it('should find Chromatic by USB identifiers', () => {
      const profile = deviceRegistry.findByUsb(0x374e, 0x0101);

      expect(profile).toBeDefined();
      expect(profile?.name).toBe('Mod Retro Chromatic');
    });

    it('should return undefined for unknown USB identifiers', () => {
      const profile = deviceRegistry.findByUsb(0x1234, 0x5678);

      expect(profile).toBeUndefined();
    });
  });

  describe('findByLabel', () => {
    it('should find Chromatic by label', () => {
      const profile = deviceRegistry.findByLabel('Chromatic Video');

      expect(profile).toBeDefined();
      expect(profile?.name).toBe('Mod Retro Chromatic');
    });

    it('should be case-insensitive', () => {
      const profile = deviceRegistry.findByLabel('CHROMATIC');

      expect(profile).toBeDefined();
    });
  });

  describe('isSupported', () => {
    it('should return true for supported devices', () => {
      expect(deviceRegistry.isSupported(0x374e, 0x0101)).toBe(true);
    });

    it('should return false for unsupported devices', () => {
      expect(deviceRegistry.isSupported(0x1234, 0x5678)).toBe(false);
    });
  });
});
```

**Step 6: Run test to verify it passes**

Run: `npx vitest run tests/unit/core/domain/devices/device-registry.test.ts`
Expected: PASS

**Step 7: Create barrel export**

Create `src/core/domain/devices/index.ts`:

```typescript
export type {
  IDeviceProfile,
  UsbIdentifier,
  DisplayConfig,
  MediaConstraintConfig
} from './device-profile.interface';

export { DeviceProfile, type DeviceProfileConfig } from './device-profile.base';
export { DeviceRegistry, deviceRegistry } from './device-registry';
export { ChromaticProfile, chromaticProfile } from './profiles/chromatic.profile';
```

**Step 8: Commit**

```bash
git add src/core/domain/devices/ tests/unit/core/domain/devices/
git commit -m "feat(core): migrate device domain entities to TypeScript"
```

---

### Task 1.11: Update Core Index and Verify Build

**Files:**
- Update: `src/core/base/index.ts`
- Update: `src/core/interfaces/index.ts`
- Update: `src/core/domain/index.ts`
- Update: `src/core/index.ts`

**Step 1: Finalize barrel exports**

Update `src/core/base/index.ts`:

```typescript
export type { IDisposable } from './disposable.interface';
export { validateDependencies } from './validate-deps.utils';
export {
  BaseService,
  type ILogger,
  type ILoggerFactory,
  type BaseServiceDependencies
} from './service.base';
export {
  BaseOrchestrator,
  type IEventBus,
  type BaseOrchestratorDependencies,
  type EventSubscriptionMap
} from './orchestrator.base';
```

Update `src/core/domain/index.ts`:

```typescript
export * from './devices';
// export * from './transcode'; // TODO: Phase 1.12
```

Update `src/core/index.ts`:

```typescript
// Core package - process-agnostic contracts and domain

// Base classes
export * from './base';

// Interfaces
export * from './interfaces';

// Domain entities
export * from './domain';

// IPC
export * from './ipc';

// Errors
export * from './errors';
```

**Step 2: Update vitest.config.js for new paths**

The existing vitest.config.js should already have path aliases. Verify `@core/*` alias works.

**Step 3: Run all core tests**

Run: `npx vitest run tests/unit/core/`
Expected: All tests pass

**Step 4: Run full test suite to verify no regressions**

Run: `npm run test:run`
Expected: All 2815+ tests pass

**Step 5: Commit**

```bash
git add src/core/
git commit -m "feat(core): finalize core package exports and verify build"
```

---

### Task 1.12: Create Phase 1 Summary PR

**Step 1: Check all changes**

Run: `git log --oneline main..HEAD`
Expected: All Phase 1 commits listed

**Step 2: Run full validation**

```bash
npm run lint
npm run test:run
npm run typecheck
```
Expected: All pass

**Step 3: Create PR (if ready)**

```bash
git push origin feature/clean-architecture-phase1
gh pr create --title "feat: Phase 1 - Extract core package with TypeScript" --body "## Summary
- Created \`src/core/\` package with Clean Architecture contracts
- Migrated base classes (BaseService, BaseOrchestrator) to TypeScript
- Added typed interfaces for infrastructure, adapters, and services
- Added IPC channels with typed contracts
- Migrated device domain entities

## Testing
- All 2815+ existing tests pass
- New core tests added for base classes and domain entities

## Next Steps
- Phase 2: Extract \`@prismgb/gpu\` package
"
```

---

## Phase 2-6: Subsequent Phases

Phase 2 through 6 plans will be created after Phase 1 is complete and validated. This ensures:

1. Phase 1 foundation is stable before building on it
2. Learnings from Phase 1 inform subsequent phases
3. Each phase can be planned with accurate file mappings

**Phase 2 Preview:** Extract `@prismgb/gpu` package
- Create new workspace package
- Migrate rendering pipeline, shaders, workers
- Define public API (createPipeline, PresetRegistry, detectCapabilities)

**Phase 3 Preview:** Restructure `main/` process
- Move services to `infrastructure/`
- Consolidate IPC handlers
- Add `application/` layer

**Phase 4 Preview:** Restructure `renderer/infrastructure/`
- Migrate services from `features/*/services/`
- Consolidate adapters
- Move streaming acquisition

**Phase 5 Preview:** Restructure `renderer/application/`
- Consolidate all orchestrators
- Update container wiring

**Phase 6 Preview:** Restructure `renderer/presentation/`
- Consolidate UI components
- Consolidate effects
- Consolidate styles

---

## Appendix: File Migration Mapping

### Files Moving to core/ (Phase 1)

| Current Location | New Location |
|-----------------|--------------|
| `shared/base/service.base.js` | `core/base/service.base.ts` |
| `shared/base/orchestrator.base.js` | `core/base/orchestrator.base.ts` |
| `shared/base/validate-deps.utils.js` | `core/base/validate-deps.utils.ts` |
| `shared/interfaces/device-adapter.interface.js` | `core/interfaces/adapters/device-adapter.interface.ts` |
| `shared/interfaces/device-status-provider.interface.js` | `core/interfaces/adapters/device-status-provider.interface.ts` |
| `shared/interfaces/fallback-strategy.interface.js` | `core/interfaces/adapters/fallback-strategy.interface.ts` |
| `shared/ipc/channels.json` | `core/ipc/channels.ts` |
| `shared/ipc/channels.config.js` | (merged into channels.ts) |
| `shared/features/devices/device-profile.base.js` | `core/domain/devices/device-profile.base.ts` |
| `shared/features/devices/device.registry.js` | `core/domain/devices/device-registry.ts` |
| `shared/features/devices/profiles/chromatic/*` | `core/domain/devices/profiles/chromatic.profile.ts` |
| `shared/lib/errors.utils.js` | `core/errors/app-error.ts` |

### Files Staying in shared/ (Until Later Phases)

| File | Reason | Future Location |
|------|--------|-----------------|
| `shared/config/dom-selectors.config.js` | Renderer-only | `renderer/presentation/config/` |
| `shared/config/css-classes.config.js` | Renderer-only | `renderer/presentation/config/` |
| `shared/config/constants.config.js` | Renderer-only | `renderer/presentation/config/` |
| `shared/streaming/acquisition/*` | Browser-only | `renderer/infrastructure/streaming/` |
| `shared/utils/brightness.utils.js` | UI-only | `renderer/presentation/` |
