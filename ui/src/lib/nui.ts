import { useEffect, useRef } from 'react'

export const RESOURCE_FALLBACK = 'osm-propkit'

// Browser check: both globals must be absent, invokeNative alone is missing in some in-game frames
export const isEnvBrowser = !window.invokeNative && !window.GetParentResourceName

type MockHandler = (event: string, data: any) => any
let mockHandler: MockHandler | null = null
export function setMockHandler(h: MockHandler) { mockHandler = h }

// Quiet events run every frame (camera input, gizmo drags); they skip the artificial dev delay
const QUIET = new Set(['cam:input', 'cam:look', 'cam:orbit', 'cam:pan', 'cam:zoom', 'editor:set', 'studio:item', 'hub:highlight', 'studio:sync', 'studio:matte'])

export async function fetchNui<T = any>(event: string, data?: unknown): Promise<T> {
  if (isEnvBrowser) {
    if (!QUIET.has(event)) await new Promise((r) => setTimeout(r, 160))
    return (mockHandler ? mockHandler(event, data) : { ok: true }) as T
  }
  const resource = window.GetParentResourceName ? window.GetParentResourceName() : RESOURCE_FALLBACK
  try {
    const res = await fetch(`https://${resource}/${event}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(data ?? {}),
    })
    return (await res.json()) as T
  } catch {
    return { ok: false } as T
  }
}

// Rpc: server calls through the client's pass-through
export function rpc<T = any>(name: string, args?: unknown): Promise<T> {
  return fetchNui<T>('rpc', { name, args: args ?? {} })
}

export function useNuiEvent<T = any>(action: string, handler: (data: T) => void) {
  const saved = useRef(handler)
  saved.current = handler
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const p = event.data
      if (p && p.action === action) saved.current(p.data as T)
    }
    window.addEventListener('message', listener)
    return () => window.removeEventListener('message', listener)
  }, [action])
}

export function onNui(action: string, fn: (data: any) => void) {
  const listener = (event: MessageEvent) => {
    const p = event.data
    if (p && p.action === action) fn(p.data)
  }
  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}

// Dispatch: the dev bar and mocks speak the same message contract Lua uses
export function dispatch(action: string, data?: unknown) {
  window.dispatchEvent(new MessageEvent('message', { data: { action, data } }))
}
