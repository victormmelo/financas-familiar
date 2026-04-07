'use client'

import { useSyncExternalStore } from 'react'

function subscribeMediaQuery(query: string, onChange: () => void) {
  const mql = window.matchMedia(query)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function getMediaSnapshot(query: string) {
  return () => window.matchMedia(query).matches
}

/**
 * `true` quando a media query casa no cliente; `false` no SSR e até hidratar.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => subscribeMediaQuery(query, onStoreChange),
    getMediaSnapshot(query),
    () => false,
  )
}
