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

/** Loads a script by URL, once per URL. */
export const loadScript = (src: string): Command<ScriptMessage, never, never> => ({
  name: 'Script.load',
  args: { src },
  effect: Effect.matchEffect(
    Effect.tryPromise({
      try: () =>
        new Promise<void>((resolve, reject) => {
          if (typeof document === 'undefined') {
            reject(new Error('script loading is unavailable'))
            return
          }
          // getAttribute, not .src: the property resolves to an absolute URL
          // and would never equal the given string.
          const present = Array.from(document.getElementsByTagName('script')).some(
            element => element.getAttribute('src') === src,
          )
          if (present) {
            resolve()
            return
          }
          const element = document.createElement('script')
          element.src = src
          element.async = true
          element.onload = () => resolve()
          element.onerror = () => reject(new Error(`failed to load script: ${src}`))
          document.head.appendChild(element)
        }),
      catch: (error: unknown) => error,
    }),
    {
      onFailure: error => Effect.succeed(ScriptMessage.LoadFailed({ message: failMessage(error) })),
      onSuccess: () => Effect.succeed(ScriptMessage.Loaded()),
    },
  ),
})
