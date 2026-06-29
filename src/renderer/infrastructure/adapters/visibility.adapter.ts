type Cleanup = () => void;

export class VisibilityAdapter {
  private _handleVisibilityChange: (() => void) | null = null;

  isHidden(): boolean {
    return typeof document !== 'undefined' ? Boolean(document.hidden) : false;
  }

  onVisibilityChange(callback: (hidden: boolean) => void): Cleanup {
    if (typeof document === 'undefined') return () => {};

    this._handleVisibilityChange = () => callback(this.isHidden());
    document.addEventListener('visibilitychange', this._handleVisibilityChange);
    return () => this.dispose();
  }

  dispose(): void {
    if (this._handleVisibilityChange && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._handleVisibilityChange);
      this._handleVisibilityChange = null;
    }
  }
}
