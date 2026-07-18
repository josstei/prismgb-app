import { afterEach, beforeEach } from 'vitest';

import { installAnimationFrameMock } from './browser-api.installers.js';

const installers = [];

beforeEach(() => {
  installers.push(installAnimationFrameMock());
});

afterEach(() => {
  while (installers.length > 0) {
    installers.pop().cleanup();
  }
});
