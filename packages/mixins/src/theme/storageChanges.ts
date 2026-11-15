import { Effect, Queue, Stream } from 'effect'

/**
 * What another tab of this origin wrote under `key` in `localStorage`:
 * the new value, or `null` when it removed the key (or cleared storage). The
 * browser fires `storage` in every other document of the origin and never in
 * the one that wrote, so this tab's own `choose` is not heard.
 */
export const storageChanges = (key: string): Stream.Stream<string | null> => {
  if (typeof window === 'undefined') return Stream.empty
  return Stream.callback<string | null>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const listener = (event: StorageEvent) => {
          // `key` is null for `clear()`; `sessionStorage` writes carry another area.
          if (event.key !== null && event.key !== key) return
          // Reading `localStorage` throws where storage is blocked.
          try {
            if (event.storageArea !== window.localStorage) return
          } catch {
            return
          }
          Queue.offerUnsafe(queue, event.newValue)
        }
        window.addEventListener('storage', listener)
        return listener
      }),
      listener =>
        Effect.sync(() => {
          window.removeEventListener('storage', listener)
        }),
    ),
  )
}
