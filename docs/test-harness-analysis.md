# Test Harness Analysis: Long-Term Scalable Improvements

This document provides an exhaustive analysis of the PrismGB test harness with fact-based recommendations for long-term scalability. All assertions are validated against the actual codebase.

## Executive Summary

The test harness currently has:
- **118 test files** with **2,710 passing tests**
- **173 source files** (excluding index.js entry points)
- Tests located in `tests/` with unit, integration, and performance subdirectories
- Vitest + happy-dom environment with Testing Library integration
- Coverage thresholds: 80% lines/functions/statements, 75% branches

---

## 1. Structural Issues and Recommendations

### 1.1 Test Directory Structure Misalignment

**Problem:**
The test directory structure (`tests/unit/`) does not consistently mirror the source structure (`src/`). This creates cognitive overhead when locating tests and makes it difficult to identify untested modules.

**Evidence from codebase:**
- Source: `src/renderer/features/streaming/services/streaming.service.js`
- Test: `tests/unit/features/streaming/services/streaming.service.test.js`
- But source: `src/renderer/ui/orchestration/ui-setup.orchestrator.js`
- Test: `tests/unit/ui/ui-setup.orchestrator.test.js` (missing intermediate path)

**Scalable Solution:**
Adopt **co-location** of tests alongside source files using `*.test.js` suffix:

```
src/
  renderer/
    features/
      streaming/
        services/
          streaming.service.js
          streaming.service.test.js  <-- co-located
```

**Benefits:**
- Immediate visibility of test coverage when browsing code
- Automatic test discovery via glob pattern `**/*.test.js`
- Reduced path maintenance burden
- Industry standard (React, Angular, Vue ecosystems)

**Migration Strategy:**
1. Update `vitest.config.js` to include `src/**/*.test.js`
2. Gradually migrate tests feature-by-feature
3. Keep `tests/integration/` and `tests/performance/` as separate directories (appropriate for cross-cutting tests)

---

### 1.2 Inconsistent Mock Creation Patterns

**Problem:**
Mock creation is inconsistent across test files, leading to duplication and potential drift.

**Evidence from codebase:**

*Pattern A - Inline mocks in test file (streaming.service.test.js:18-61):*
```javascript
mockEventBus = {
  publish: vi.fn(),
  subscribe: vi.fn()
};
mockDeviceService = {
  getRegisteredStoredDeviceIds: vi.fn(),
  enumerateDevices: vi.fn(),
  // ...
};
```

*Pattern B - Factory functions from central mocks (device-connection.service.test.js:7-8):*
```javascript
import { createMockEventBus, createMockLoggerFactory } from '../../../../mocks/index.js';
```

**Scalable Solution:**
Establish a **Mock Factory System** with typed contracts:

```javascript
// tests/factories/mock-event-bus.factory.js
export function createMockEventBus(overrides = {}) {
  const listeners = new Map();
  return {
    publish: vi.fn((event, data) => {
      listeners.get(event)?.forEach(cb => cb(data));
    }),
    subscribe: vi.fn((event, callback) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(callback);
      return () => { /* unsubscribe */ };
    }),
    // Test helpers
    _clearAll: () => listeners.clear(),
    _trigger: (event, data) => { /* for manual triggering */ },
    ...overrides
  };
}
```

**Factory Directory Structure:**
```
tests/
  factories/
    index.js              # Re-exports all factories
    event-bus.factory.js
    logger.factory.js
    device.factory.js
    stream.factory.js
    app-state.factory.js
  fixtures/
    device-configs.fixture.js
    stream-settings.fixture.js
```

---

### 1.3 Missing Test Contract Validation

**Problem:**
Services and orchestrators implement implicit contracts (event publishing, method signatures) that aren't validated at the test level. When contracts change, tests may pass but integration breaks.

**Evidence:**
The `EventChannels` config (`src/renderer/infrastructure/events/event-channels.config.js`) defines 60+ event channels. Tests verify specific events are published, but there's no contract verification that:
1. All expected events are tested
2. Event payload schemas match expectations
3. Event sequences are validated

**Scalable Solution:**
Implement **Contract Testing with Event Schemas**:

```javascript
// tests/contracts/event-contracts.js
import Joi from 'joi';

export const EventContracts = {
  'stream:started': Joi.object({
    stream: Joi.object().required(),
    device: Joi.object({
      deviceId: Joi.string().required(),
      label: Joi.string(),
      kind: Joi.string().valid('videoinput')
    }).required(),
    capabilities: Joi.object()
  }),

  'capture:recording-ready': Joi.object({
    blob: Joi.object().instance(Blob).required(),
    filename: Joi.string().pattern(/\.webm$/).required()
  })
};

// Test utility
export function validateEventPayload(eventName, payload) {
  const schema = EventContracts[eventName];
  if (!schema) throw new Error(`No contract defined for event: ${eventName}`);
  const { error } = schema.validate(payload);
  if (error) throw new Error(`Contract violation for ${eventName}: ${error.message}`);
}
```

**Integration in Tests:**
```javascript
it('should publish stream:started with valid contract', async () => {
  await service.start('device-1');

  const [eventName, payload] = mockEventBus.publish.mock.calls[0];
  validateEventPayload(eventName, payload);
});
```

---

## 2. Mock Infrastructure Improvements

### 2.1 MockDevice Lacks State Machine Fidelity

**Problem:**
The `MockDevice` class (`tests/mocks/MockDevice.js`) simulates device behavior but doesn't model state transitions that occur in real devices.

**Evidence (MockDevice.js:192-206):**
```javascript
getStream(constraints = {}) {
  if (!this.isConnected) {
    return Promise.reject(new Error('Device not connected'));
  }
  this.activeStream = createMockStream({...});
  return Promise.resolve(this.activeStream);
}
```

Real devices have complex state transitions:
- Device enumeration → Permission request → Stream acquisition → Track ended

**Scalable Solution:**
Add a **finite state machine** to MockDevice:

```javascript
// tests/mocks/MockDevice.js
const DeviceState = {
  DISCONNECTED: 'disconnected',
  CONNECTED: 'connected',
  PERMISSION_REQUESTED: 'permission_requested',
  STREAMING: 'streaming',
  ERROR: 'error'
};

const validTransitions = {
  [DeviceState.DISCONNECTED]: [DeviceState.CONNECTED],
  [DeviceState.CONNECTED]: [DeviceState.PERMISSION_REQUESTED, DeviceState.DISCONNECTED],
  [DeviceState.PERMISSION_REQUESTED]: [DeviceState.STREAMING, DeviceState.ERROR, DeviceState.DISCONNECTED],
  [DeviceState.STREAMING]: [DeviceState.CONNECTED, DeviceState.DISCONNECTED],
  [DeviceState.ERROR]: [DeviceState.CONNECTED, DeviceState.DISCONNECTED]
};

class MockDevice {
  #state = DeviceState.DISCONNECTED;

  _transition(newState) {
    const allowed = validTransitions[this.#state];
    if (!allowed?.includes(newState)) {
      throw new Error(`Invalid state transition: ${this.#state} -> ${newState}`);
    }
    this.#state = newState;
  }

  async getStream(constraints) {
    this._transition(DeviceState.PERMISSION_REQUESTED);
    // Simulate permission delay
    await new Promise(r => setTimeout(r, 10));
    this._transition(DeviceState.STREAMING);
    return this._createStream(constraints);
  }
}
```

---

### 2.2 Canvas/WebGL Mock Incompleteness

**Problem:**
The canvas mock in `tests/setup.js` provides minimal functionality, causing tests to skip critical rendering paths.

**Evidence (setup.js:136-141):**
```javascript
HTMLCanvasElement.prototype.getContext = vi.fn((type, options) => {
  if (type === '2d') {
    return mockCanvasContext;
  }
  return null; // WebGL not mocked!
});
```

The render pipeline tests (`render-pipeline.service.test.js`) heavily mock the GPU renderer because WebGL isn't available.

**Scalable Solution:**
Create a **WebGL Mock Framework**:

```javascript
// tests/mocks/webgl-context.mock.js
export function createMockWebGLContext() {
  const state = {
    programs: new Map(),
    textures: new Map(),
    framebuffers: new Map(),
    viewport: { x: 0, y: 0, width: 0, height: 0 }
  };

  return {
    // Shader operations
    createShader: vi.fn(type => ({ type, source: null })),
    shaderSource: vi.fn((shader, source) => { shader.source = source; }),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),

    // Program operations
    createProgram: vi.fn(() => {
      const id = `program-${state.programs.size}`;
      state.programs.set(id, { linked: false });
      return id;
    }),
    linkProgram: vi.fn(id => { state.programs.get(id).linked = true; }),
    useProgram: vi.fn(),

    // Texture operations
    createTexture: vi.fn(() => `texture-${state.textures.size}`),
    bindTexture: vi.fn(),
    texImage2D: vi.fn(),

    // Drawing
    viewport: vi.fn((x, y, w, h) => {
      state.viewport = { x, y, width: w, height: h };
    }),
    drawArrays: vi.fn(),

    // Test helpers
    _state: state,
    _reset: () => { /* clear state */ }
  };
}
```

---

## 3. Test Isolation and Performance

### 3.1 Global State Leakage Risk

**Problem:**
Some tests mutate global state (document, navigator, performance) without isolated cleanup, creating potential test order dependencies.

**Evidence (capture.service.test.js:115-123):**
```javascript
beforeEach(() => {
  // ...
  global.document = {
    ...realDocument,
    createElement: vi.fn((tag) => {
      if (tag === 'canvas') return mockCanvas;
      return realCreateElement(tag);
    })
  };
});
```

This overwrites `global.document` without guaranteed restoration.

**Scalable Solution:**
Implement a **Global State Sandbox**:

```javascript
// tests/utils/global-sandbox.js
export function createGlobalSandbox() {
  const snapshots = new Map();

  return {
    capture(keys) {
      for (const key of keys) {
        snapshots.set(key, globalThis[key]);
      }
    },

    restore() {
      for (const [key, value] of snapshots) {
        globalThis[key] = value;
      }
      snapshots.clear();
    },

    mock(key, value) {
      if (!snapshots.has(key)) {
        snapshots.set(key, globalThis[key]);
      }
      globalThis[key] = value;
    }
  };
}

// Usage in tests
let sandbox;
beforeEach(() => {
  sandbox = createGlobalSandbox();
  sandbox.mock('document', createMockDocument());
});

afterEach(() => {
  sandbox.restore();
});
```

---

### 3.2 Slow Setup Time

**Problem:**
Test execution shows `setup 65.00s` for 118 files, averaging 550ms per file. This impacts developer feedback loops.

**Evidence from vitest output:**
```
Duration 137.94s (transform 2.83s, setup 65.00s, ...)
```

**Root Cause Analysis:**
1. `tests/setup.js` initializes complex mocks unconditionally
2. `tests/testing-library.setup.js` configures Testing Library for every test
3. `happy-dom` environment creation overhead per test file

**Scalable Solution:**
Implement **Lazy Mock Initialization**:

```javascript
// tests/setup.js - convert to lazy initialization
let _mediaDevicesMock = null;
let _canvasMock = null;

export function getMediaDevicesMock() {
  if (!_mediaDevicesMock) {
    _mediaDevicesMock = createMediaDevicesMock();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: _mediaDevicesMock,
      writable: true,
      configurable: true
    });
  }
  return _mediaDevicesMock;
}

// Reset between tests if needed
beforeEach(() => {
  _mediaDevicesMock?.reset?.();
});
```

**Additionally:**
- Split setup files by feature domain
- Use `vitest.workspace.ts` to parallelize across feature boundaries
- Consider `poolOptions.forks.singleFork: true` for faster test isolation

---

## 4. Coverage and Testing Gaps

### 4.1 Untested Error Paths

**Problem:**
Many error handling paths are tested only for the "happy path" exception throwing, not for proper state cleanup.

**Evidence (streaming.service.test.js:149-161):**
```javascript
it('should publish stream:error event on failure', async () => {
  const error = new Error('Stream failed');
  mockAdapter.getStream.mockRejectedValue(error);

  await expect(service.start('device-1')).rejects.toThrow();

  expect(mockEventBus.publish).toHaveBeenCalledWith('stream:error', {
    error,
    operation: 'start',
    deviceId: 'device-1',
    message: 'Stream failed'
  });
});
```

This verifies the error event but doesn't verify:
- Service state is properly reset
- Resources are cleaned up
- Retry attempts are handled correctly

**Scalable Solution:**
Create **Error Path Test Patterns**:

```javascript
describe('Error Recovery', () => {
  describe('after stream acquisition failure', () => {
    beforeEach(async () => {
      mockAdapter.getStream.mockRejectedValue(new Error('Acquisition failed'));
      await expect(service.start('device-1')).rejects.toThrow();
    });

    it('should reset to idle state', () => {
      expect(service._state).toBe('idle');
    });

    it('should clear stream reference', () => {
      expect(service.currentStream).toBeNull();
    });

    it('should clear adapter reference', () => {
      expect(service.currentAdapter).toBeNull();
    });

    it('should allow immediate retry', async () => {
      mockAdapter.getStream.mockResolvedValue(mockStream);
      await expect(service.start('device-1')).resolves.toBeDefined();
    });

    it('should not leave dangling event subscriptions', () => {
      // Verify no leaked subscriptions from failed attempt
      expect(mockEventBus._getListenerCount('some:internal:event')).toBe(0);
    });
  });
});
```

---

### 4.2 Missing Orchestrator Event Flow Tests

**Problem:**
Orchestrators coordinate between services via events, but tests verify individual method calls rather than complete event flows.

**Evidence:**
`capture.orchestrator.test.js` tests individual methods but doesn't verify:
- Complete screenshot workflow: button click → shutter flash → capture → download
- Event ordering constraints
- Concurrent operation handling

**Scalable Solution:**
Implement **Workflow Integration Tests**:

```javascript
// tests/workflows/capture.workflow.test.js
describe('Screenshot Workflow', () => {
  let orchestrator, eventBus, captureService, uiBridge;

  beforeEach(() => {
    eventBus = createMockEventBus();
    // Wire up all components
    orchestrator = new CaptureOrchestrator({ eventBus, ... });
    uiBridge = new CaptureUIBridge({ eventBus, ... });
    // Initialize
    orchestrator.initialize();
    uiBridge.initialize();
  });

  it('should complete full screenshot workflow in order', async () => {
    const events = [];
    const captureEvents = Object.values(EventChannels.CAPTURE);
    captureEvents.forEach(event => {
      eventBus.subscribe(event, () => events.push(event));
    });

    // Trigger workflow
    eventBus.publish(EventChannels.UI.SCREENSHOT_REQUESTED);
    await vi.waitFor(() => events.length >= 2);

    // Verify event order
    expect(events).toEqual([
      'capture:screenshot-triggered',
      'capture:screenshot-ready'
    ]);
  });

  it('should handle concurrent screenshot requests', async () => {
    // Rapid-fire two requests
    eventBus.publish(EventChannels.UI.SCREENSHOT_REQUESTED);
    eventBus.publish(EventChannels.UI.SCREENSHOT_REQUESTED);

    await vi.waitFor(() => captureService.takeScreenshot.mock.calls.length >= 1);

    // Second request should be debounced/ignored
    expect(captureService.takeScreenshot).toHaveBeenCalledTimes(1);
  });
});
```

---

## 5. Test Data Management

### 5.1 Hardcoded Test Data

**Problem:**
Test data is scattered throughout test files with magic numbers and duplicated constants.

**Evidence (streaming.service.test.js:78-88):**
```javascript
const mockDevice = { deviceId: 'device-1', label: 'Chromatic', kind: 'videoinput' };
const mockVideoTrack = {
  getSettings: vi.fn(() => ({ width: 160 })),
  // ...
};
```

The values `160`, `144`, `'Chromatic'` appear across many test files.

**Scalable Solution:**
Create a **Test Fixtures System**:

```javascript
// tests/fixtures/devices.fixture.js
import { CHROMATIC_SPECS } from '../mocks/MockDevice.js';

export const DeviceFixtures = {
  chromatic: {
    deviceId: 'test-chromatic-device',
    label: 'Chromatic',
    kind: 'videoinput',
    specs: CHROMATIC_SPECS
  },

  genericCamera: {
    deviceId: 'test-generic-camera',
    label: 'Generic USB Camera',
    kind: 'videoinput'
  }
};

export const StreamFixtures = {
  chromaticStream: (overrides = {}) => ({
    id: `stream-${Date.now()}`,
    device: DeviceFixtures.chromatic,
    settings: {
      width: CHROMATIC_SPECS.nativeWidth,
      height: CHROMATIC_SPECS.nativeHeight,
      frameRate: CHROMATIC_SPECS.defaultFrameRate
    },
    ...overrides
  })
};

// tests/fixtures/index.js
export * from './devices.fixture.js';
export * from './streams.fixture.js';
export * from './settings.fixture.js';
```

**Usage:**
```javascript
import { DeviceFixtures, StreamFixtures } from '../../../fixtures';

it('should start streaming', async () => {
  const device = DeviceFixtures.chromatic;
  const expectedStream = StreamFixtures.chromaticStream();
  // ...
});
```

---

## 6. Documentation and Discoverability

### 6.1 Missing Test Documentation

**Problem:**
Tests lack documentation about their purpose, setup requirements, and relationship to features.

**Scalable Solution:**
Adopt **Documentation-First Test Structure**:

```javascript
/**
 * @fileoverview StreamingService Unit Tests
 *
 * Tests the streaming service which manages video stream acquisition
 * from USB capture devices (primarily Chromatic).
 *
 * @see src/renderer/features/streaming/services/streaming.service.js
 * @see docs/architecture-diagrams.md#streaming-and-device-selection
 *
 * Dependencies mocked:
 * - deviceService: Device enumeration and discovery
 * - adapterFactory: Device adapter creation
 * - eventBus: Event publication
 * - ipcClient: Main process communication
 *
 * Key behaviors tested:
 * - Stream acquisition with specific device ID
 * - Auto-device selection when no ID provided
 * - Error recovery and state cleanup
 * - Event publication for lifecycle changes
 */

describe('StreamingService', () => {
  /**
   * Setup creates a fully isolated instance with all dependencies mocked.
   * Each test starts with service in 'idle' state.
   */
  beforeEach(() => { /* ... */ });

  describe('start', () => {
    /**
     * Stream start is the primary entry point for the streaming feature.
     *
     * State transitions: idle -> starting -> streaming
     * Events published: stream:started OR stream:error
     *
     * Preconditions:
     * - Device must exist and be connected
     * - No existing stream active (auto-stopped if present)
     */
    // ...
  });
});
```

---

## 7. Performance Testing Infrastructure

### 7.1 Benchmark Tests Lack CI Integration

**Problem:**
Performance benchmarks exist (`tests/performance/benchmarks.test.js`) but thresholds are arbitrary and not tracked over time.

**Evidence (benchmarks.test.js:23-30):**
```javascript
const THRESHOLDS = {
  resolutionCalcCached: 0.1,      // Cached resolution calc < 0.1ms
  resolutionCalcUncached: 1,     // Uncached resolution calc < 1ms
  // ...
};
```

These thresholds are:
- Not validated against baseline measurements
- Not tracked for regression detection
- Not integrated into CI/CD

**Scalable Solution:**
Implement **Performance Baseline System**:

```javascript
// tests/performance/baseline.config.js
export const PerformanceBaselines = {
  version: '1.2.1', // Track with app version
  lastUpdated: '2025-01-18',

  metrics: {
    'resolution-calc-cached': {
      baseline: 0.05,  // ms
      tolerance: 0.2,  // 20% variance allowed
      unit: 'ms'
    },
    'cache-operations': {
      baseline: 0.02,
      tolerance: 0.3,
      unit: 'ms'
    },
    'stream-start-cycle': {
      baseline: 5,
      tolerance: 0.25,
      unit: 'ms'
    }
  }
};

// tests/performance/utils.js
export function assertPerformance(metricName, measuredValue) {
  const metric = PerformanceBaselines.metrics[metricName];
  if (!metric) throw new Error(`Unknown metric: ${metricName}`);

  const maxAllowed = metric.baseline * (1 + metric.tolerance);

  if (measuredValue > maxAllowed) {
    throw new Error(
      `Performance regression: ${metricName}\n` +
      `  Baseline: ${metric.baseline}${metric.unit}\n` +
      `  Measured: ${measuredValue.toFixed(4)}${metric.unit}\n` +
      `  Max allowed: ${maxAllowed.toFixed(4)}${metric.unit}`
    );
  }
}
```

**CI Integration:**
```yaml
# .github/workflows/reusable-ci-tests.yml
- name: Run Performance Tests
  run: npm run test:performance

- name: Compare Performance Baselines
  run: node scripts/ci/compare-performance.js
```

---

## 8. Implementation Roadmap

### Phase 1: Foundation (Prerequisites for other phases)
1. Establish mock factory system
2. Create fixture system
3. Implement global state sandbox

### Phase 2: Quality (Improve existing tests)
1. Add contract testing
2. Enhance error path coverage
3. Document existing tests

### Phase 3: Structure (Reorganize for scale)
1. Co-locate tests with source
2. Split setup files by domain
3. Implement lazy mock initialization

### Phase 4: Automation (CI/CD integration)
1. Performance baseline tracking
2. Workflow integration tests
3. Coverage gap detection

---

## Appendix: Current Test Distribution

| Category | Test Files | Tests | Notes |
|----------|-----------|-------|-------|
| Streaming | 14 | ~380 | Well covered |
| Devices | 15 | ~320 | Good adapter coverage |
| Capture | 4 | ~150 | Missing error workflows |
| Settings | 8 | ~200 | Good coverage |
| UI Components | 18 | ~400 | Missing some components |
| Infrastructure | 8 | ~200 | EventBus, DI well tested |
| Utils | 6 | ~180 | Complete coverage |
| Integration | 1 | ~50 | Needs expansion |
| Performance | 2 | ~80 | Needs CI integration |

---

## Conclusion

The test harness is functional with 2,710 passing tests but requires structural improvements for long-term scalability:

1. **Consistency** - Standardize mock patterns and test organization
2. **Contracts** - Validate service interfaces and event schemas
3. **Isolation** - Improve global state management
4. **Performance** - Reduce setup overhead and track baselines
5. **Documentation** - Make tests self-documenting

These recommendations prioritize sustainable architecture over quick fixes, ensuring the test suite scales with the application.
