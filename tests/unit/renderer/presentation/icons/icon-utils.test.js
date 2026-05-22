import { afterEach, describe, expect, it, vi } from 'vitest';
import { getIconSvg } from '@renderer/presentation/icons/icon.utils.js';

describe('icon utils', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns existing icon SVGs from the discovered registry', () => {
    expect(getIconSvg('toolbar-record')).toContain('<svg');
    expect(getIconSvg('overlay-fullscreen-exit')).toContain('<svg');
  });

  it('applies explicit icon size overrides', () => {
    const svg = getIconSvg('toolbar-record', 20);

    expect(svg).toContain('width="20"');
    expect(svg).toContain('height="20"');
  });

  it('warns and returns an empty string for unknown icons', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(getIconSvg('missing-icon')).toBe('');
    expect(warn).toHaveBeenCalledWith('Icon "missing-icon" not found in registry');
  });
});
