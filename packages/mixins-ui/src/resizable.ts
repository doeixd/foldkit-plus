import { Match, Option, Schema } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import { Move } from 'foldkit-primitives/dom'
import { Resize } from 'foldkit-primitives/observers'
import type { MixinList } from './resolve.js'

/**
 * Two panels with a handle between them, shadcn's Resizable and the APG's
 * window splitter: the handle is a `separator` with its value, a tab stop
 * the arrows step and Home and End send to the bounds, and a drag moves it.
 * The split is a small Model of this module's (the first panel's share, and
 * where a drag began), which the application keeps and folds with `update`;
 * a drag measures the group with the `Resize` Mount and follows the `Move`
 * Mount's deltas from where it began.
 */
export const ResizableSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  first: Slot.make({ capability: Capability.Container }),
  handle: Slot.make({
    capability: Capability.Interactive,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel],
  }),
  second: Slot.make({ capability: Capability.Container }),
})

export const Model = Schema.Struct({
  /** The first panel's share of the group, 0 to 1. */
  share: Schema.Number,
  /** Where a drag began, while one runs. */
  from: Schema.Option(Schema.Number),
  /** The group's length along the split, in pixels, once measured. */
  size: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  /** The group was measured, along the split. */
  Measured: { size: Schema.Number },
  DragStarted: {},
  Dragged: { delta: Schema.Number },
  DragEnded: {},
  /** The keys set the share. */
  Set: { share: Schema.Number },
})
export type Message = typeof Message.Type

/** The bounds a share stays within, and what a key moves it by. */
export interface Bounds {
  readonly min?: number | undefined
  readonly max?: number | undefined
  readonly step?: number | undefined
}

export const init = (share = 0.5): Model => ({ share, from: Option.none(), size: 0 })

const clamped = (share: number, bounds: Bounds) =>
  Math.round(Math.min(bounds.max ?? 0.9, Math.max(bounds.min ?? 0.1, share)) * 1000) / 1000

/** The split after `message`; the same Model when nothing changes. */
export const update = (model: Model, message: Message, bounds: Bounds = {}): Model =>
  Message.match(message, {
    Measured: ({ size }) => (size === model.size ? model : { ...model, size }),
    DragStarted: () => ({ ...model, from: Option.some(model.share) }),
    Dragged: ({ delta }) =>
      Option.match(model.from, {
        onNone: () => model,
        onSome: from => {
          if (model.size <= 0) return model
          const share = clamped(from + delta / model.size, bounds)
          return share === model.share ? model : { ...model, share }
        },
      }),
    DragEnded: () => (Option.isNone(model.from) ? model : { ...model, from: Option.none() }),
    Set: ({ share }) => {
      const next = clamped(share, bounds)
      return next === model.share ? model : { ...model, share: next }
    },
  })

export interface ResizableView<Message> extends Bounds {
  readonly model: Model
  /** Lifts the split's own Messages into the application's. */
  readonly onMessage: (message: typeof Message.Type) => NoInfer<Message>
  /** `horizontal` puts the panels side by side, `vertical` one over the other. */
  readonly orientation?: 'horizontal' | 'vertical' | undefined
  /** The handle's accessible name: what it resizes. */
  readonly label: string
  readonly first: Html
  readonly second: Html
  /** A style of `ResizableSlots`, for the split's look. */
  readonly style?: NamedStyle<typeof ResizableSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

export const view = <Outer>(options: ResizableView<Outer>, h: HtmlBuilder<Outer>): Html => {
  const builders = SlotView.buildersFor(
    ResizableSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const vertical = options.orientation === 'vertical'
  const step = options.step ?? 0.05
  const percent = Math.round(options.model.share * 100)
  const lift = options.onMessage
  const measured = Mount.mapMessage(Resize(), fact =>
    lift(Message.Measured({ size: vertical ? fact.height : fact.width })),
  )
  const dragged = Mount.mapMessage(Move(), fact =>
    lift(
      Match.valueTags(fact, {
        MoveStarted: () => Message.DragStarted(),
        Moved: ({ deltaX, deltaY }) => Message.Dragged({ delta: vertical ? deltaY : deltaX }),
        MoveEnded: () => Message.DragEnded(),
      }),
    ),
  )
  const keys = new Map<string, number>(
    vertical
      ? [
          ['ArrowUp', -step],
          ['ArrowDown', step],
        ]
      : [
          ['ArrowLeft', -step],
          ['ArrowRight', step],
        ],
  )
  return h.div(
    builders.root.attrs([
      h.DataAttribute('orientation', vertical ? 'vertical' : 'horizontal'),
      h.Style({ '--_fk-split': `${percent}%` }),
      h.OnMount(measured),
    ]),
    [
      h.div(builders.first.attrs(), [options.first]),
      h.div(
        builders.handle.attrs([
          h.Role('separator'),
          // A separator's orientation is its own line's: a side-by-side split's is vertical.
          h.AriaOrientation(vertical ? 'horizontal' : 'vertical'),
          h.AriaLabel(options.label),
          h.AriaValuemin(Math.round((options.min ?? 0.1) * 100)),
          h.AriaValuemax(Math.round((options.max ?? 0.9) * 100)),
          h.AriaValuenow(percent),
          h.Tabindex(0),
          h.OnKeyDownSelfPreventDefault(key => {
            if (key === 'Home') return Option.some(lift(Message.Set({ share: options.min ?? 0.1 })))
            if (key === 'End') return Option.some(lift(Message.Set({ share: options.max ?? 0.9 })))
            return Option.map(Option.fromNullishOr(keys.get(key)), by =>
              lift(Message.Set({ share: options.model.share + by })),
            )
          }),
          h.OnMount(dragged),
        ]),
        [],
      ),
      h.div(builders.second.attrs(), [options.second]),
    ],
  )
}
