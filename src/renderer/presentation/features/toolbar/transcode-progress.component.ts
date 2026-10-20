import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';
import { bindText, bindClass, bindStyleProperty } from '@renderer/presentation/primitives/signal-bindings.utils';
import type { TranscodeProgressStore } from '@renderer/presentation/state/transcode-progress.store';

export interface TranscodeProgressElements {
  recordBtn?: HTMLElement | null;
  transcodeRing?: HTMLElement | null;
  transcodePercentLabel?: HTMLElement | null;
}

export interface TranscodeProgressComponentOptions {
  elements: TranscodeProgressElements;
  store: TranscodeProgressStore;
}

/** Reflects the transcode-progress store onto the record button's ring and label. */
export class TranscodeProgressComponent extends PresentationComponent {
  constructor({ elements, store }: TranscodeProgressComponentOptions) {
    super();
    this.disposables.add(store);

    const recordBtn = elements.recordBtn ?? null;
    this.disposables.add(bindClass(recordBtn, 'transcoding', store.transcoding));
    this.disposables.add(bindClass(recordBtn, 'transcode-success', store.succeeded));
    this.disposables.add(bindClass(recordBtn, 'transcode-error', store.failed));

    this.disposables.add(bindStyleProperty(elements.transcodeRing ?? null, '--progress', store.progressVariable));
    this.disposables.add(bindText(elements.transcodePercentLabel ?? null, store.label));
  }
}
