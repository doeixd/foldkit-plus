/**
 * Script loading as a Command: appends a `src` script to the head unless one
 * is already there. Idempotent by URL — concurrent placements collapse onto
 * the first tag instead of fetching twice. Yields `Loaded` on success and
 * `LoadFailed` otherwise (network error, no document), so `update` handles
 * both outcomes as Messages.
 */
import { Effect, Schema } from 'effect'
import type { Command } from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'

export const ScriptMessage = defineMessageUnion({
  Loaded: {},
  LoadFailed: { message: Schema.String },
})
export type ScriptMessage = typeof ScriptMessage.Type

const failMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

// Tags still fetching, by URL: concurrent loads share one tag and its fate.
const inflight = new Map<string, Promise<void>>()

/** Loads a script by URL, once per URL. */
export const loadScript = (src: string): Command<ScriptMessage, never, never> => ({
  name: 'Script.load',
  args: { src },
  effect: Effect.matchEffect(
    Effect.tryPromise({
      try: () => {
        if (typeof document === 'undefined') {
          return Promise.reject(new Error('script loading is unavailable'))
        }
        // Concurrent loads share one tag and its fate, instead of racing
        // past the presence check and fetching twice: the in-flight entry
        // is checked before presence, in the same synchronous block that
        // appends, so a second load cannot slip between them.
        const running = inflight.get(src)
        if (running !== undefined) return running
        // getAttribute, not .src: the property resolves to an absolute URL
        // and would never equal the given string.
        const present = Array.from(document.getElementsByTagName('script')).some(
          element => element.getAttribute('src') === src,
        )
        if (present) return Promise.resolve()
        const completion = new Promise<void>((resolve, reject) => {
          const element = document.createElement('script')
          element.src = src
          element.async = true
          element.onload = () => resolve()
          element.onerror = () => {
            // A dead tag must not satisfy later presence checks.
            element.remove()
            reject(new Error(`failed to load script: ${src}`))
          }
          document.head.appendChild(element)
        })
        const tracked = completion.then(
          () => {
            inflight.delete(src)
          },
          (error: unknown) => {
            inflight.delete(src)
            throw error
          },
        )
        inflight.set(src, tracked)
        return tracked
      },
      catch: (error: unknown) => error,
    }),
    {
      onFailure: error => Effect.succeed(ScriptMessage.LoadFailed({ message: failMessage(error) })),
      onSuccess: () => Effect.succeed(ScriptMessage.Loaded()),
    },
  ),
})
