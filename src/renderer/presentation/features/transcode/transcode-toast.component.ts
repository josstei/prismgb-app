import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';

const TRANSCODE_HIDE_TIMEOUT = Symbol('transcode-toast-hide-timeout');

type ClassListLike = {
  add(...tokens: string[]): void;
  remove(...tokens: string[]): void;
};

type ProgressRingLike = {
  style: {
    setProperty(propertyName: string, value: string | null): void;
  };
};

type LabelLike = {
  textContent: string | null;
};

export interface TranscodeToastElements {
  recordBtn?: { classList: ClassListLike } | null;
  transcodeRing?: ProgressRingLike | null;
  transcodePercentLabel?: LabelLike | null;
}

class TranscodeToastComponent extends PresentationComponent {
  declare elements: TranscodeToastElements;
  declare _isVisible: boolean;

  constructor(elements: TranscodeToastElements) {
    super();
    this.elements = elements;
    this._isVisible = false;
  }

  show(): void {
    if (!this.elements.recordBtn) return;

    this.cancelManaged(TRANSCODE_HIDE_TIMEOUT);

    this.elements.recordBtn.classList.remove('transcode-success', 'transcode-error');
    this.elements.recordBtn.classList.add('transcoding');

    if (this.elements.transcodeRing) {
      this.elements.transcodeRing.style.setProperty('--progress', '0');
    }

    if (this.elements.transcodePercentLabel) {
      this.elements.transcodePercentLabel.textContent = '';
    }

    this._isVisible = true;
  }

  updateProgress(percent: number): void {
    if (!this._isVisible) return;

    if (percent <= 0) return;

    const clampedPercent = Math.min(100, Math.max(0, Math.round(percent)));

    if (this.elements.transcodeRing) {
      this.elements.transcodeRing.style.setProperty('--progress', String(clampedPercent));
    }

    if (this.elements.transcodePercentLabel) {
      this.elements.transcodePercentLabel.textContent = `${clampedPercent}%`;
    }
  }

  showSuccess(): void {
    if (!this.elements.recordBtn) return;

    this.elements.recordBtn.classList.remove('transcoding');
    this.elements.recordBtn.classList.add('transcode-success');

    if (this.elements.transcodePercentLabel) {
      this.elements.transcodePercentLabel.textContent = '\u2713';
    }

    this.replaceTimeout(TRANSCODE_HIDE_TIMEOUT, () => {
      this.hide();
    }, 1200);
  }

  showError(): void {
    if (!this.elements.recordBtn) return;

    if (this.elements.transcodePercentLabel) {
      this.elements.transcodePercentLabel.textContent = '\u2717';
    }

    this.elements.recordBtn.classList.remove('transcoding');
    this.elements.recordBtn.classList.add('transcode-error');

    this.replaceTimeout(TRANSCODE_HIDE_TIMEOUT, () => {
      this.hide();
    }, 2000);
  }

  hide(): void {
    if (!this.elements.recordBtn) return;

    this.cancelManaged(TRANSCODE_HIDE_TIMEOUT);

    this.elements.recordBtn.classList.remove('transcoding', 'transcode-success', 'transcode-error');

    if (this.elements.transcodeRing) {
      this.elements.transcodeRing.style.setProperty('--progress', '0');
    }
    if (this.elements.transcodePercentLabel) {
      this.elements.transcodePercentLabel.textContent = '';
    }

    this._isVisible = false;
  }

  get isVisible(): boolean {
    return this._isVisible;
  }

  override dispose(): void {
    super.dispose();
    this.hide();
  }
}

export { TranscodeToastComponent };
