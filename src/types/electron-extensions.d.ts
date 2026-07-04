declare namespace Electron {
  interface App {
    isQuitting?: boolean;
  }
}

interface Window {
  __app?: () => unknown;
  webkitAudioContext?: typeof AudioContext;
}
