/// <reference types="vite/client" />

declare global {
  interface Window {
    invokeNative?: unknown
    GetParentResourceName?: () => string
  }
}

export {}
