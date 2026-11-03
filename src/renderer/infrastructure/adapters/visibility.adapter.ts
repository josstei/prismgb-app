

export class VisibilityAdapter {
  isHidden(): boolean {
    return document.hidden;
  }

  onVisibilityChange(callback: (hidden: boolean) => void): () => void {
    const source = document;
    const listener = () => callback(source.hidden);
    source.addEventListener('visibilitychange', listener);
    return () => source.removeEventListener('visibilitychange', listener);
  }
}
