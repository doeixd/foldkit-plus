/**
 * Focused element as an entry — not a bundle, because elements are not
 * Model facts: this reports the active element's tag and id (both
 * serializable), and the parent stores what matters. Starts with the
 * current answer, then follows `focusin`/`focusout`.
 */
import { Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

export const ActiveElementMessage = defineMessageUnion({
  Changed: { tag: Schema.String, id: Schema.NullOr(Schema.String) },
})
export type ActiveElementMessage = typeof ActiveElementMessage.Type

/**
 * Focus changes on the document. Without a document the stream is empty
 * instead of throwing. Lift with `Subscription.persistent`, mapping into
 * the parent's Message.
 */
export const activeElementEvents = (): Stream.Stream<ActiveElementMessage> => {
  if (typeof document === 'undefined') return Stream.empty
  const read = (): ActiveElementMessage => {
    const element = document.activeElement as Element | null | undefined
    return ActiveElementMessage.Changed({
      tag: element?.tagName ?? '',
      id: element?.id !== undefined && element.id !== '' ? element.id : null,
    })
  }
  const changes: Stream.Stream<ActiveElementMessage> = Stream.mergeAll(
    [
      Stream.fromEventListener(document, 'focusin').pipe(Stream.map(read)),
      Stream.fromEventListener(document, 'focusout').pipe(Stream.map(read)),
    ],
    { concurrency: 'unbounded' },
  )
  return Stream.concat(Stream.make(read()), changes)
}
