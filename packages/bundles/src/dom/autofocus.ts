/**
 * Autofocus as a Mount: focuses the element on insert, then emits `Focused`.
 * The message means focus was requested — a non-focusable element or a
 * hidden tab may decline, and the browser does not report that. Plain
 * `focus()`, no scroll options: scroll behavior stays the application's
 * choice.
 */
import { Effect, Schema } from 'effect'
import * as Mount from 'foldkit/mount'

export const Focused = Schema.TaggedStruct('Focused', {})
export type Focused = typeof Focused.Type

export const Autofocus = Mount.define('Autofocus', {
  messages: [Focused],
  execute: ({ element }) =>
    Effect.gen(function* () {
      const focusable = element as unknown as { readonly focus?: unknown }
      if (typeof focusable.focus === 'function') {
        ;(focusable.focus as () => void).call(element)
      }
      return Focused.make({})
    }),
})
