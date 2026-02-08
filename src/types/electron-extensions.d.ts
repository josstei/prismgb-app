declare namespace Electron {
  interface App {
    isQuitting?: boolean;
  }
}

interface Window {
  webkitAudioContext?: typeof AudioContext;
}
