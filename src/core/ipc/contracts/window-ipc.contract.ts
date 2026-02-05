/**
 * Window resize event payload.
 */
export interface WindowResizedPayload {
  width: number;
  height: number;
}

/**
 * Set fullscreen request payload.
 */
export interface SetFullscreenRequest {
  fullscreen: boolean;
}

/**
 * Is fullscreen response.
 */
export interface IsFullscreenResponse {
  fullscreen: boolean;
}
