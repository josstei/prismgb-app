/**
 * Concrete typed @OnEvent decorator bound to the renderer EventPayloadMap.
 * Handler payload parameters are compile-checked against the subscribed
 * channel's payload type.
 */

import { createOnEventDecorator } from '@platform/core';
import type { EventPayloadMap } from './event-payloads.js';

export const OnEvent = createOnEventDecorator<EventPayloadMap>();
