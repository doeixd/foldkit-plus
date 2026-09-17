/**
 * Keyboard as an entry — not a bundle, because the parent owns whatever key
 * state it keeps (a held-keys set, a shortcut map, a focused field): this
 * reports presses and releases, including auto-repeat, and the parent
 * stores what matters. Hotkey matching stays application policy.
 */
import { Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

export const KeyboardMessage = defineMessageUnion({
  Pressed: { key: Schema.String, repeat: Schema.Boolean },
  Released: { key: Schema.String },
})
export type KeyboardMessage = typeof KeyboardMessage.Type

/**
 * Key presses and releases on the window. Without a window the stream is
 * empty instead of throwing. Lift with `Subscription.persistent`, mapping
 * into the parent's Message.
 */
export const keyboardEvents = (): Stream.Stream<KeyboardMessage> => {
  if (typeof window === 'undefined') return Stream.empty
  const downs: Stream.Stream<KeyboardMessage> = Stream.fromEventListener<KeyboardEvent>(
    window,
    'keydown',
  ).pipe(Stream.map(event => KeyboardMessage.Pressed({ key: event.key, repeat: event.repeat })))
  const ups: Stream.Stream<KeyboardMessage> = Stream.fromEventListener<KeyboardEvent>(
    window,
    'keyup',
  ).pipe(Stream.map(event => KeyboardMessage.Released({ key: event.key })))
  return Stream.mergeAll([downs, ups], { concurrency: 'unbounded' })
}
