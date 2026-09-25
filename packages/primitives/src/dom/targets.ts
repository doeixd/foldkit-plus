/**
 * Which marked descendant of an element the pointer is over, and which one was
 * pressed, as a Mount: one set of listeners on the container, not one per item.
 * A descendant is marked by an attribute whose value is its id, such as a
 * canvas's `data-composition-node` or a table's `data-row`. The nearest marked
 * ancestor of the event's target, inside the container, is the one reported.
 *
 * What hovering or pressing means (a selection, an outline, a menu) is the
 * parent's `update`.
 */
import { Effect, Queue, Schema, Stream } from 'effect'
import * as Mount from 'foldkit/mount'

export const TargetHovered = Schema.TaggedStruct('TargetHovered', {
  /** The marked descendant under the pointer, or `null` when there is none. */
  id: Schema.NullOr(Schema.String),
})
export type TargetHovered = typeof TargetHovered.Type

export const TargetPressed = Schema.TaggedStruct('TargetPressed', {
  id: Schema.String,
  shiftKey: Schema.Boolean,
  altKey: Schema.Boolean,
  ctrlKey: Schema.Boolean,
  metaKey: Schema.Boolean,
})
export type TargetPressed = typeof TargetPressed.Type

export type TargetFact = TargetHovered | TargetPressed

type Modified = Event & {
  readonly shiftKey?: boolean
  readonly altKey?: boolean
  readonly ctrlKey?: boolean
  readonly metaKey?: boolean
}

/** The id of the nearest marked element at or above `from`, inside `container`. */
export const targetOf = (container: Element, from: EventTarget | null, attribute: string) => {
  if (!(from instanceof Element)) return null
  const marked = from.closest(`[${attribute}]`)
  return marked !== null && container.contains(marked) ? marked.getAttribute(attribute) : null
}

export const Targets = Mount.defineStream('Targets', {
  messages: [TargetHovered, TargetPressed],
  args: {
    /** The attribute that marks a descendant, holding its id. */
    attribute: Schema.String,
    /** Prevent a press's default, such as a link navigating inside an editor's canvas. */
    preventDefault: Schema.Boolean,
  },
  execute: ({ element, attribute, preventDefault }) =>
    Stream.callback<TargetFact>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          let hovered: string | null = null
          const hover = (id: string | null) => {
            if (id === hovered) return
            hovered = id
            Queue.offerUnsafe(queue, TargetHovered.make({ id }))
          }
          const listeners: ReadonlyArray<readonly [string, (event: Event) => void]> = [
            ['pointerover', event => hover(targetOf(element, event.target, attribute))],
            ['pointerleave', () => hover(null)],
            [
              'click',
              event => {
                const id = targetOf(element, event.target, attribute)
                if (id === null) return
                if (preventDefault) event.preventDefault()
                const modified = event as Modified
                Queue.offerUnsafe(
                  queue,
                  TargetPressed.make({
                    id,
                    shiftKey: modified.shiftKey === true,
                    altKey: modified.altKey === true,
                    ctrlKey: modified.ctrlKey === true,
                    metaKey: modified.metaKey === true,
                  }),
                )
              },
            ],
          ]
          for (const [type, listener] of listeners) element.addEventListener(type, listener)
          return listeners
        }),
        listeners =>
          Effect.sync(() => {
            for (const [type, listener] of listeners) element.removeEventListener(type, listener)
          }),
      ),
    ),
})
