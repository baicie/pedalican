/// <reference types="vite/client" />

import type { PelicanRiderDebugApi } from './game/Game';

declare global {
  interface Window {
    __pelicanRider?: PelicanRiderDebugApi;
  }
}

export {};
