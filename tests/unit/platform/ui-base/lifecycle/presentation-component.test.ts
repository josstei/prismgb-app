import { describe, it, expect, vi } from 'vitest';
import { PresentationComponent } from '../../../../../src/platform/ui-base/lifecycle/presentation-component.base.js';

describe('PresentationComponent', () => {
  it('tracks and disposes a simple disposable', async () => {
    const component = new (class extends PresentationComponent {
      public testTrack(d: { dispose: () => void }) {
        return this.track(d);
      }
    })();

    const disposeSpy = vi.fn();
    component.testTrack({ dispose: disposeSpy });

    expect(disposeSpy).not.toHaveBeenCalled();
    await component.dispose();
    expect(disposeSpy).toHaveBeenCalled();
  });

  it('listens to DOM events and removes them on dispose', async () => {
    const el = document.createElement('div');
    const handler = vi.fn();
    const component = new (class extends PresentationComponent {
      public testListen(target: EventTarget, type: string, cb: any) {
        return this.listen(target as any, type, cb);
      }
    })();

    component.testListen(el, 'click', handler);
    el.dispatchEvent(new Event('click'));
    expect(handler).toHaveBeenCalledTimes(1);

    await component.dispose();
    el.dispatchEvent(new Event('click'));
    expect(handler).toHaveBeenCalledTimes(1); // Should not increase
  });

  it('manages replaceManaged correctly', async () => {
    const component = new (class extends PresentationComponent {
      public testReplaceManaged(key: string, d: { dispose: () => void }) {
        return this.replaceManaged(key as any, d);
      }
    })();

    const dispose1 = vi.fn();
    const dispose2 = vi.fn();

    component.testReplaceManaged('key1', { dispose: dispose1 });
    component.testReplaceManaged('key1', { dispose: dispose2 }); // Should dispose the first one immediately

    expect(dispose1).toHaveBeenCalled();
    expect(dispose2).not.toHaveBeenCalled();

    await component.dispose();
    expect(dispose2).toHaveBeenCalled();
  });

  it('replaceManagedGroup tears a group down in reverse order and supports replacement', () => {
    class GroupHarness extends PresentationComponent {
      registerGroup(key: symbol, disposers: Array<() => void>) {
        return this.replaceManagedGroup(key, disposers);
      }
    }

    const harness = new GroupHarness();
    const key = Symbol('group');
    const order: string[] = [];

    harness.registerGroup(key, [
      () => { order.push('first'); },
      () => { order.push('second'); }
    ]);
    harness.registerGroup(key, [() => { order.push('fresh'); }]);

    expect(order).toEqual(['second', 'first']);
    void harness.dispose();
    expect(order).toEqual(['second', 'first', 'fresh']);
  });

  describe('applyOptions', () => {
    interface WidgetOptions {
      label?: string;
      debounceMs?: number;
      trigger: HTMLElement | null;
    }

    class WidgetHarness extends PresentationComponent {
      declare label: string;
      declare debounceMs: number;
      declare trigger: HTMLElement | null;

      constructor(options: WidgetOptions) {
        super();
        this.applyOptions<WidgetOptions>({ label: 'default-label', debounceMs: 100 }, options);
      }
    }

    it('assigns defaults for options the caller omits', () => {
      const harness = new WidgetHarness({ trigger: null });

      expect(harness.label).toBe('default-label');
      expect(harness.debounceMs).toBe(100);
      expect(harness.trigger).toBeNull();
    });

    it('lets explicit constructor options override defaults', () => {
      const trigger = document.createElement('button');
      const harness = new WidgetHarness({ trigger, label: 'custom', debounceMs: 250 });

      expect(harness.label).toBe('custom');
      expect(harness.debounceMs).toBe(250);
      expect(harness.trigger).toBe(trigger);
    });

    it('exposes assigned fields as own enumerable properties for white-box reads', () => {
      const harness = new WidgetHarness({ trigger: null });

      expect(Object.prototype.hasOwnProperty.call(harness, 'label')).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(harness, 'debounceMs')).toBe(true);
    });
  });
});
