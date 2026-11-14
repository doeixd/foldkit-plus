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
    /** The physical key (`KeyN`), for a layout that typed another character. */
    code: Schema.String,
    /** Focus was in a field where text is typed, so a bare letter is text, not a shortcut. */
    typing: Schema.Boolean,
    repeat: Schema.Boolean,
    ctrl: Schema.Boolean,
    shift: Schema.Boolean,
    alt: Schema.Boolean,
    meta: Schema.Boolean,
  },
  Released: { key: Schema.String },
})
export type KeyboardMessage = typeof KeyboardMessage.Type

const keyboardless = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
])

/** Whether `target` is where text is typed: a text-like input, a textarea, a select or an editable element. */
export const isTypingTarget = (target: EventTarget | null | undefined): boolean => {
  if (!(target instanceof Element)) return false
  if (target instanceof HTMLElement && target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  return target instanceof HTMLInputElement && !keyboardless.has(target.type)
}

/**
 * Key presses and releases on the window. A press made during an IME
 * composition is not reported: it types text, and is no shortcut. Without a window the stream is
 * empty instead of throwing. Lift with `Subscription.persistentEntry`, mapping
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
          if (event.isComposing || event.keyCode === 229) return
          const press = KeyboardMessage.Pressed({
            key: event.key,
            code: event.code,
            typing: isTypingTarget(event.composedPath()[0]),
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
