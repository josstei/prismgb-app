type Cleanup = () => void;

export class ReducedMotionAdapter {
  private _mediaQuery: MediaQueryList | null = null;
  private _cleanupFn: Cleanup | null = null;

  prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    return Boolean(mediaQuery.matches);
  }

  onChange(callback: (prefersReducedMotion: boolean) => void): Cleanup {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};

    this._mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event: MediaQueryListEvent) => callback(Boolean(event.matches));

    if (typeof this._mediaQuery.addEventListener !== 'function') return () => {};

    this._mediaQuery.addEventListener('change', handleChange);
    this._cleanupFn = () => this._mediaQuery?.removeEventListener('change', handleChange);
    return () => this.dispose();
  }

  dispose(): void {
    if (this._cleanupFn) {
      this._cleanupFn();
      this._cleanupFn = null;
    }
    this._mediaQuery = null;
  }
}
