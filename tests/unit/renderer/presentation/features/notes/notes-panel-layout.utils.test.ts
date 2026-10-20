import { describe, it, expect } from 'vitest';
import { calculateAnchoredDisclosureLayout } from '@renderer/presentation/features/notes/notes-panel-layout.utils';

describe('calculateAnchoredDisclosureLayout', () => {
  it('returns right-of-anchor placement when there is enough width', () => {
    const layout = calculateAnchoredDisclosureLayout({
      anchorRect: {
        top: 100,
        left: 200,
        right: 260,
        bottom: 140
      },
      viewportWidth: 760,
      viewportHeight: 700,
      rightOffset: 24,
      sizeDefaults: {
        minWidth: 200,
        maxWidth: 450,
        minHeight: 300,
        maxHeight: 600
      }
    });

    expect(layout.placement).toBe('right');
    expect(layout.left).toBe(276);
    expect(layout.top).toBe(100);
    expect(layout.minWidth).toBe(200);
    expect(layout.maxWidth).toBe(450);
    expect(layout.minHeight).toBe(300);
    expect(layout.maxHeight).toBe(600);
  });

  it('falls back to dock-below and clamps coordinates within the viewport', () => {
    const layout = calculateAnchoredDisclosureLayout({
      anchorRect: {
        top: 100,
        left: 200,
        right: 260,
        bottom: 140
      },
      viewportWidth: 420,
      viewportHeight: 250,
      rightOffset: 80,
      sizeDefaults: {
        minWidth: 200,
        maxWidth: 450,
        minHeight: 300,
        maxHeight: 600
      }
    });

    expect(layout.placement).toBe('below');
    expect(layout.left).toBe(140);
    expect(layout.top).toBe(122);
    expect(layout.minWidth).toBe(200);
    expect(layout.maxWidth).toBe(324);
    expect(layout.minHeight).toBe(120);
    expect(layout.maxHeight).toBe(120);
  });

  it('clamps right placement to the safe edge for offscreen anchors', () => {
    const layout = calculateAnchoredDisclosureLayout({
      anchorRect: { top: 20, left: -80, right: -40, bottom: 60 },
      viewportWidth: 760,
      viewportHeight: 700,
      sizeDefaults: {
        minWidth: 200,
        maxWidth: 450,
        minHeight: 300,
        maxHeight: 600
      }
    });
    expect(layout.placement).toBe('right');
    expect(layout.left).toBe(8);
  });
});
