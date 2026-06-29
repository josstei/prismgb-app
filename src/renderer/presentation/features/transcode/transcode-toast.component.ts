import { PresentationComponent, bindText, bindClass, bindStyleProperty } from '@prismgb/ui-base';
import type { TranscodeProgressStore } from '@renderer/presentation/state/transcode-progress.store.js';

type ClassListSink = {
  classList: {
    toggle(token: string, force?: boolean): boolean | void;
  };
};

type StylePropertySink = {
  style: {
    setProperty(propertyName: string, value: string | null): void;
  };
};

type TextSink = {
  textContent: string | null;
};

export interface TranscodeToastElements {
  recordBtn?: ClassListSink | null;
  transcodeRing?: StylePropertySink | null;
  transcodePercentLabel?: TextSink | null;
}

export interface TranscodeToastComponentOptions {
  elements: TranscodeToastElements;
  store: TranscodeProgressStore;
}

/** Reflects the transcode-progress store onto the record button via declarative bindings. */
class TranscodeToastComponent extends PresentationComponent {
  constructor({ elements, store }: TranscodeToastComponentOptions) {
    super();
    this.track(store);

    const recordBtn = elements.recordBtn ?? null;
    this.track(bindClass(recordBtn, 'transcoding', store.transcoding));
    this.track(bindClass(recordBtn, 'transcode-success', store.succeeded));
    this.track(bindClass(recordBtn, 'transcode-error', store.failed));

    this.track(bindStyleProperty(elements.transcodeRing ?? null, '--progress', store.progressVariable));
    this.track(bindText(elements.transcodePercentLabel ?? null, store.label));
  }
}

export { TranscodeToastComponent };
