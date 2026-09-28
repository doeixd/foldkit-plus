/**
 * Keyboard as an entry — not a bundle, because the parent owns whatever key
 * state it keeps (a held-keys set, a shortcut map, a focused field): this
 * reports presses and releases, including auto-repeat, and the parent
 * stores what matters. Hotkey matching stays application policy.
 */
import { Effect, Queue, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type { KeyPress } from './hotkeys.js'

export const KeyboardMessage = defineMessageUnion({
  Pressed: {
    key: Schema.String,
    repeat: Schema.Boolean,
    ctrl: Schema.Boolean,
    shift: Schema.Boolean,
    alt: Schema.Boolean,
    meta: Schema.Boolean,
  },
  Released: { key: Schema.String },
})
export type KeyboardMessage = typeof KeyboardMessage.Type

/**
 * Key presses and releases on the window. Without a window the stream is
 * empty instead of throwing. Lift with `Subscription.persistent`, mapping
 * into the parent's Message.
 */
export const keyboardEvents = (
  options: {
    /**
     * Whether to cancel a press's default (the page scrolling under an arrow
     * key, the browser's own shortcut), decided in the listener, since a
     * default can only be cancelled before the event finishes dispatching.
     */
    readonly preventDefault?: (press: KeyPress) => boolean
  } = {},
): Stream.Stream<KeyboardMessage> => {
  if (typeof window === 'undefined') return Stream.empty
  return Stream.callback<KeyboardMessage>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const down = (event: KeyboardEvent) => {
          const press = KeyboardMessage.Pressed({
            key: event.key,
            repeat: event.repeat,
            ctrl: event.ctrlKey,
            shift: event.shiftKey,
            alt: event.altKey,
            meta: event.metaKey,
          })
          if (options.preventDefault?.(press) === true) event.preventDefault()
          Queue.offerUnsafe(queue, press)
        }
        const up = (event: KeyboardEvent) =>
          Queue.offerUnsafe(queue, KeyboardMessage.Released({ key: event.key }))
        window.addEventListener('keydown', down)
        window.addEventListener('keyup', up)
        return { down, up }
      }),
      ({ down, up }) =>
        Effect.sync(() => {
          window.removeEventListener('keydown', down)
          window.removeEventListener('keyup', up)
        }),
    ),
  )
}
