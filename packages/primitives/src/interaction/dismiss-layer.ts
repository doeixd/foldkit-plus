/**
 * Dismissable layers: Escape closes the topmost open layer, a pointer press
 * outside closes the layers it is outside of. One Bundle, placed once, owns
 * the document listeners; each layer's Behavior marks its container (and its
 * trigger) with data attributes. The stack is the DOM order of the marked
 * elements at the moment of the event, so a layer opening or closing needs no
 * registration. A press inside a parent layer is outside its children, so the
 * parent stays and the children go; a press on a layer's trigger counts as
 * inside it, so a trigger never dismisses and reopens in one click. What a
 * dismissal does is the placement's `onOut`.
 */
import { Effect, Queue, Schema, Stream } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import { Bundle, type Declared } from 'foldkit-bundle'
import { Behavior, Capability } from 'foldkit-mixins'

export const LAYER_ATTRIBUTE = 'data-foldkit-plus-layer'
export const TRIGGER_ATTRIBUTE = 'data-foldkit-plus-layer-trigger'
const OUTSIDE_ATTRIBUTE = 'data-foldkit-plus-layer-outside'
const ESCAPE_ATTRIBUTE = 'data-foldkit-plus-layer-escape'

/** An open layer as the document showed it: bottom to top is DOM order. */
export const Layer = Schema.Struct({
  id: Schema.String,
  /** Dismiss on a press outside it. */
  outside: Schema.Boolean,
  /** Dismiss on Escape when topmost. */
  escape: Schema.Boolean,
})
export type Layer = typeof Layer.Type

export const Model = Schema.Struct({
  /** The open layers at the last event, bottom to top. */
  layers: Schema.Array(Layer),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  /** A pointer went down; `inside` are the layers whose element or trigger was on the event's path. */
  PressedAt: { layers: Schema.Array(Layer), inside: Schema.Array(Schema.String) },
  PressedEscape: { layers: Schema.Array(Layer) },
})
export type Message = typeof Message.Type

export const Dismiss = Schema.TaggedStruct('Dismiss', { ids: Schema.Array(Schema.String) })
export type Dismiss = typeof Dismiss.Type

/** Which layers a press inside `inside` dismisses: every layer above the topmost one hit, or all when none was. */
export const toDismiss = (
  layers: ReadonlyArray<Layer>,
  inside: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  let topmostHit = -1
  layers.forEach((layer, index) => {
    if (inside.includes(layer.id)) topmostHit = index
  })
  return layers
    .slice(topmostHit + 1)
    .filter(layer => layer.outside)
    .map(layer => layer.id)
}

type Return = Update.ReturnWithOutMessage<Model, Message, Dismiss>

export const bundle = Bundle.make('DismissLayer', {
  Model,
  Message,
  init: () => ({ model: { layers: [] } }),
  update: (_model, message): Return =>
    Message.match<Return>(message, {
      PressedAt: ({ layers, inside }) => {
        const ids = toDismiss(layers, inside)
        return ids.length === 0
          ? { model: { layers } }
          : { model: { layers }, outMessage: Dismiss.make({ ids }) }
      },
      PressedEscape: ({ layers }) => {
        const top = layers[layers.length - 1]
        return top !== undefined && top.escape
          ? { model: { layers }, outMessage: Dismiss.make({ ids: [top.id] }) }
          : { model: { layers } }
      },
    }),
  subscriptions: () =>
    Subscription.make<Model, Message>()(() => ({
      document: Subscription.persistent(documentEvents()),
    })),
})

const openLayers = (root: ParentNode): ReadonlyArray<Layer> =>
  Array.from(root.querySelectorAll(`[${LAYER_ATTRIBUTE}]`)).map(element => ({
    id: element.getAttribute(LAYER_ATTRIBUTE) ?? '',
    outside: element.getAttribute(OUTSIDE_ATTRIBUTE) !== 'false',
    escape: element.getAttribute(ESCAPE_ATTRIBUTE) !== 'false',
  }))

/** The layer ids whose element or trigger is on the event's composed path. */
export const layersOnPath = (path: ReadonlyArray<EventTarget>): ReadonlyArray<string> => {
  const ids: Array<string> = []
  for (const target of path) {
    if (!(target instanceof Element)) continue
    const id = target.getAttribute(LAYER_ATTRIBUTE) ?? target.getAttribute(TRIGGER_ATTRIBUTE)
    if (id !== null && !ids.includes(id)) ids.push(id)
  }
  return ids
}

/**
 * The facts are read inside the listener, not after: `composedPath()` is
 * empty once dispatch has finished, and the open layers must be the ones the
 * press saw, not the ones a later render left.
 */
const documentEvents = (): Stream.Stream<Message> => {
  if (typeof document === 'undefined') return Stream.empty
  return Stream.callback<Message>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const onPointerDown = (event: Event) =>
          Queue.offerUnsafe(
            queue,
            Message.PressedAt({
              layers: openLayers(document),
              inside: layersOnPath(event.composedPath()),
            }),
          )
        const onKeyDown = (event: Event) => {
          if ((event as KeyboardEvent).key !== 'Escape') return
          Queue.offerUnsafe(queue, Message.PressedEscape({ layers: openLayers(document) }))
        }
        document.addEventListener('pointerdown', onPointerDown, { capture: true })
        document.addEventListener('keydown', onKeyDown, { capture: true })
        return { onPointerDown, onKeyDown }
      }),
      ({ onPointerDown, onKeyDown }) =>
        Effect.sync(() => {
          document.removeEventListener('pointerdown', onPointerDown, { capture: true })
          document.removeEventListener('keydown', onKeyDown, { capture: true })
        }),
    ),
  )
}

export interface BehaviorOptions<Input, Slots> {
  /** The layer's root, rendered only while the layer is open. */
  readonly layer: keyof Slots & string
  /** The element that opens the layer, so a press on it is inside. */
  readonly trigger?: keyof Slots & string
  readonly id: (input: Input) => string
  /** Dismiss on a press outside. Default `true`. */
  readonly outsidePress?: boolean
  /** Dismiss on Escape when topmost. Default `true`. */
  readonly escape?: boolean
}

/**
 * Marks the layer's container and trigger for the placed stack. The layer
 * takes part only while its element is rendered, so an `open` flag in the
 * parent Model is the whole lifecycle. Not for an element with `popover`,
 * which the browser dismisses itself.
 */
export const behavior =
  <Field extends string>(_declared: Declared<typeof bundle, Field>) =>
  <Slots>(slots: Slots) =>
  <Input, ParentMessage>(
    options: BehaviorOptions<Input, Slots>,
  ): Behavior.NamedBehavior<Slots, Input, ParentMessage> =>
    Behavior.forSlots(slots)<Input, ParentMessage>(
      {
        [options.layer]: Behavior.slot({
          requires: { capability: Capability.Container },
          attributes: ({
            input,
            h,
          }: {
            readonly input: Input
            readonly h: HtmlBuilder<ParentMessage>
          }) => [
            h.Attribute(LAYER_ATTRIBUTE, options.id(input)),
            ...(options.outsidePress === false ? [h.Attribute(OUTSIDE_ATTRIBUTE, 'false')] : []),
            ...(options.escape === false ? [h.Attribute(ESCAPE_ATTRIBUTE, 'false')] : []),
          ],
        }),
        ...(options.trigger === undefined
          ? {}
          : {
              [options.trigger]: Behavior.slot({
                requires: { capability: Capability.Interactive },
                attributes: ({
                  input,
                  h,
                }: {
                  readonly input: Input
                  readonly h: HtmlBuilder<ParentMessage>
                }) => [h.Attribute(TRIGGER_ATTRIBUTE, options.id(input))],
              }),
            }),
        // Keyed by values the caller chose; `forSlots` checks the keys exist.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
      { name: 'DismissLayer' },
    )
