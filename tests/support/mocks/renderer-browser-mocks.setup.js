import { afterEach, beforeEach } from 'vitest';

import {
  installAnimationFrameMock,
  installCanvasMocks,
  installVideoFrameCallbacksMock,
} from './browser-api.installers.js';

const installers = [];

beforeEach(() => {
  installers.push(installAnimationFrameMock());
  installers.push(installCanvasMocks());
  installers.push(installVideoFrameCallbacksMock());
});

afterEach(() => {
  while (installers.length > 0) {
    installers.pop().cleanup();
  }
});
