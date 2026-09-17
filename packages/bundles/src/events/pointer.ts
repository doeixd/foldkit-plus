/**
 * Pointer position as an entry — not a bundle, because the parent owns what
 * it keeps (a cursor, a drag anchor, hover state): this reports moves, and
 * the parent stores what matters. Element-scoped pointer needs are Mounts,
 * not this window-level entry.
 */
import { Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

export const PointerMessage = defineMessageUnion({
  Moved: { x: Schema.Number, y: Schema.Number },
})
export type PointerMessage = typeof PointerMessage.Type

/**
 * Pointer moves on the window. Without a window the stream is empty instead
 * of throwing. Lift with `Subscription.persistent`, mapping into the
 * parent's Message.
 */
export const pointerEvents = (): Stream.Stream<PointerMessage> => {
  if (typeof window === 'undefined') return Stream.empty
  return Stream.fromEventListener<PointerEvent>(window, 'pointermove').pipe(
    Stream.map(event => PointerMessage.Moved({ x: event.clientX, y: event.clientY })),
  )
}
