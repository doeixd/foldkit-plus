/**
 * Window scroll position as an entry — not a bundle, because the parent
 * owns what it keeps (a stuck header, a back-to-top gate, restore-on-back):
 * this reports positions, and the parent stores what matters.
 * Element-scoped scrolling needs a Mount, not this window-level entry.
 */
import { Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

export const ScrollMessage = defineMessageUnion({
  Scrolled: { x: Schema.Number, y: Schema.Number },
})
export type ScrollMessage = typeof ScrollMessage.Type

/**
 * Scrolls on the window. Without a window the stream is empty instead of
 * throwing. Lift with `Subscription.persistent`, mapping into the parent's
 * Message.
 */
export const scrollEvents = (): Stream.Stream<ScrollMessage> => {
  if (typeof window === 'undefined') return Stream.empty
  return Stream.fromEventListener(window, 'scroll').pipe(
    Stream.map(() => ScrollMessage.Scrolled({ x: window.scrollX, y: window.scrollY })),
  )
}
