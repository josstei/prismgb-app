import { describe, it, expect, vi } from 'vitest';
import { PresentationComponent } from '../../../src/lifecycle/presentation-component.base.js';

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
});
