/** Fixed application defaults; user preferences are defined by the renderer settings catalog. */
export const appConfig = Object.freeze({
  DEVICE_LAUNCH_DELAY: 500
});

export const uiConfig = Object.freeze({
  WINDOW_CONFIG: Object.freeze({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0f0f1e',
    title: 'PrismGB Launcher'
  })
});
