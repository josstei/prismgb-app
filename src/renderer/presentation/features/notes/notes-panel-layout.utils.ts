export interface AnchoredLayoutSizeDefaults {
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}

export interface AnchoredRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface CalculateAnchoredDisclosureLayoutOptions {
  anchorRect?: AnchoredRect | null;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
  rightOffset?: number | null;
  sizeDefaults?: Partial<AnchoredLayoutSizeDefaults> | null;
  gap?: number | null;
  safeEdge?: number | null;
  minFittableHeight?: number | null;
  minDockedVisibleHeight?: number | null;
}

export interface AnchoredDisclosureLayout {
  placement: 'below' | 'right';
  left: number;
  top: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}

const DEFAULT_ANCHORED_LAYOUT_SIZES: Readonly<AnchoredLayoutSizeDefaults> = Object.freeze({
  minWidth: 200,
  maxWidth: 450,
  minHeight: 300,
  maxHeight: 600
});

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeAnchoredLayoutSizes(
  sizeDefaults: Partial<AnchoredLayoutSizeDefaults> | null | undefined
): AnchoredLayoutSizeDefaults {
  return {
    minWidth: toFiniteNumber(sizeDefaults?.minWidth, DEFAULT_ANCHORED_LAYOUT_SIZES.minWidth),
    maxWidth: toFiniteNumber(sizeDefaults?.maxWidth, DEFAULT_ANCHORED_LAYOUT_SIZES.maxWidth),
    minHeight: toFiniteNumber(sizeDefaults?.minHeight, DEFAULT_ANCHORED_LAYOUT_SIZES.minHeight),
    maxHeight: toFiniteNumber(sizeDefaults?.maxHeight, DEFAULT_ANCHORED_LAYOUT_SIZES.maxHeight)
  };
}

/**
 * Headless anchored panel layout calculator for disclosure/popover surfaces.
 * Returns clamped panel coordinates and size bounds for right-of-anchor
 * placement with a dock-below fallback when width is constrained.
 */
export function calculateAnchoredDisclosureLayout({
  anchorRect,
  viewportWidth,
  viewportHeight,
  rightOffset = 0,
  sizeDefaults = DEFAULT_ANCHORED_LAYOUT_SIZES,
  gap = 16,
  safeEdge = 8,
  minFittableHeight = 200,
  minDockedVisibleHeight = 120
}: CalculateAnchoredDisclosureLayoutOptions = {}): AnchoredDisclosureLayout {
  const anchor = anchorRect || { left: 0, top: 0, right: 0, bottom: 0 };
  const defaults = normalizeAnchoredLayoutSizes(sizeDefaults);
  const resolvedViewportWidth = Math.max(0, toFiniteNumber(viewportWidth, 0));
  const resolvedViewportHeight = Math.max(0, toFiniteNumber(viewportHeight, 0));
  const resolvedRightOffset = Math.max(0, toFiniteNumber(rightOffset, 0));
  const resolvedGap = Math.max(0, toFiniteNumber(gap, 16));
  const resolvedSafeEdge = Math.max(0, toFiniteNumber(safeEdge, 8));

  const desiredLeft = Math.round(anchor.right + resolvedGap);
  const availableWidth = resolvedViewportWidth - resolvedRightOffset - resolvedSafeEdge - desiredLeft;

  let minWidth = defaults.minWidth;
  let maxWidth = defaults.maxWidth;
  const shouldDockBelow = availableWidth < defaults.minWidth;

  if (availableWidth > 0 && !shouldDockBelow) {
    minWidth = Math.min(minWidth, availableWidth);
    maxWidth = Math.min(maxWidth, availableWidth);
  } else if (shouldDockBelow) {
    const fallbackWidth = Math.max(1, resolvedViewportWidth - resolvedRightOffset - resolvedSafeEdge * 2);
    maxWidth = Math.min(maxWidth, fallbackWidth);
    minWidth = Math.min(minWidth, maxWidth);
  }

  const maxFittableHeight = Math.max(
    Math.max(0, toFiniteNumber(minFittableHeight, 200)),
    resolvedViewportHeight - resolvedSafeEdge * 2
  );
  let minHeight = Math.min(defaults.minHeight, maxFittableHeight);
  let maxHeight = defaults.maxHeight;

  const maxLeft = Math.max(resolvedSafeEdge, resolvedViewportWidth - resolvedRightOffset - minWidth);
  const left = shouldDockBelow
    ? clamp(Math.round(anchor.left), resolvedSafeEdge, maxLeft)
    : clamp(desiredLeft, resolvedSafeEdge, maxLeft);

  const desiredTop = shouldDockBelow
    ? Math.round(anchor.bottom + resolvedGap)
    : Math.round(anchor.top);

  if (shouldDockBelow) {
    const availableHeightBelow = Math.max(
      Math.max(0, toFiniteNumber(minDockedVisibleHeight, 120)),
      resolvedViewportHeight - desiredTop - resolvedSafeEdge
    );
    maxHeight = Math.min(maxHeight, availableHeightBelow);
    minHeight = Math.min(minHeight, maxHeight);
  }

  const maxTop = Math.max(resolvedSafeEdge, resolvedViewportHeight - minHeight - resolvedSafeEdge);
  const top = clamp(desiredTop, resolvedSafeEdge, maxTop);

  return {
    placement: shouldDockBelow ? 'below' : 'right',
    left,
    top,
    minWidth,
    maxWidth,
    minHeight,
    maxHeight
  };
}
