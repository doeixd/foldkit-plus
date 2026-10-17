import { Match, Option, Schema } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import { modifyFields } from 'foldkit/struct'
import { Move } from 'foldkit-primitives/dom'
import { Resize } from 'foldkit-primitives/observers'
import { readingKey } from './direction.js'
import type { MixinList } from './resolve.js'

/**
 * Two panels with a handle between them, shadcn's Resizable and the APG's
 * window splitter: the handle is a `separator` with its value, a tab stop
 * the arrows step and Home and End send to the bounds, and a drag moves it.
 * The split is a small Model of this module's (the first panel's share,
 * where a drag began, and the share to go back to while a panel is
 * collapsed), which the application keeps and folds with `update`; a drag
 * measures the group with the `Resize` Mount and follows the `Move` Mount's
 * deltas from where it began. A split whose bounds name a `collapsible`
 * panel collapses it on Enter or a double-click, as the APG's splitter does,
 * and the same again puts it back where it was. A panel may hold another
 * split, either way.
 */
export const ResizableSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  first: Slot.make({ capability: Capability.Container }),
  handle: Slot.make({
    capability: Capability.Interactive,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel],
  }),
  /** The mark on the handle to take hold of; the recipe's `handle: 'grip'` shows it. */
  grip: Slot.make({ capability: Capability.Container }),
  second: Slot.make({ capability: Capability.Container }),
})

export const Model = Schema.Struct({
  /** The first panel's share of the group, 0 to 1. */
  share: Schema.Number,
  /** Where a drag began, while one runs. */
  from: Schema.Option(Schema.Number),
  /** The group's length along the split, in pixels, once measured. */
  size: Schema.Number,
  /** The share to go back to, while a panel is collapsed. */
  restore: Schema.Option(Schema.Number),
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
  /** Enter or a double-click: collapse the collapsible panel, or put it back. */
  Toggled: {},
})
export type Message = typeof Message.Type

/** The bounds a share stays within, what a key moves it by, and which panel collapses. */
export interface Bounds {
  readonly min?: number | undefined
  readonly max?: number | undefined
  readonly step?: number | undefined
  /** The panel Enter and a double-click collapse; none by default. */
  readonly collapsible?: 'first' | 'second' | undefined
  /** The share of the group a collapsed panel keeps; default 0. */
  readonly collapsedTo?: number | undefined
}

export const init = (share = 0.5): Model => ({
  share,
  from: Option.none(),
  size: 0,
  restore: Option.none(),
})

/** The first panel's share while the collapsible one is collapsed. */
const collapsedShare = (bounds: Bounds, collapsible: 'first' | 'second') =>
  collapsible === 'first' ? (bounds.collapsedTo ?? 0) : 1 - (bounds.collapsedTo ?? 0)

/** A share moved by a drag or a key: within the bounds, and no longer collapsed. */
const moved = (model: Model, share: number): Model =>
  share === model.share && Option.isNone(model.restore)
    ? model
    : modifyFields(model, { share: () => share, restore: () => Option.none() })

const clamped = (share: number, bounds: Bounds) =>
  Math.round(Math.min(bounds.max ?? 0.9, Math.max(bounds.min ?? 0.1, share)) * 1000) / 1000

/** The split after `message`; the same Model when nothing changes. */
export const update = (model: Model, message: Message, bounds: Bounds = {}): Model =>
  Message.match(message, {
    Measured: ({ size }) =>
      size === model.size ? model : modifyFields(model, { size: () => size }),
    DragStarted: () => modifyFields(model, { from: () => Option.some(model.share) }),
    Dragged: ({ delta }) =>
      Option.match(model.from, {
        onNone: () => model,
        onSome: from => {
          if (model.size <= 0) return model
          return moved(model, clamped(from + delta / model.size, bounds))
        },
      }),
    DragEnded: () =>
      Option.isNone(model.from) ? model : modifyFields(model, { from: () => Option.none() }),
    Set: ({ share }) => moved(model, clamped(share, bounds)),
    Toggled: () => {
      if (bounds.collapsible === undefined) return model
      const collapsed = collapsedShare(bounds, bounds.collapsible)
      return Option.match(model.restore, {
        onSome: restore =>
          modifyFields(model, { share: () => restore, restore: () => Option.none() }),
        onNone: () =>
          modifyFields(model, { share: () => collapsed, restore: () => Option.some(model.share) }),
      })
    },
  })

export interface ResizableView<Message> extends Bounds {
  readonly model: Model
  /** Lifts the split's own Messages into the application's. */
  readonly onMessage: (message: typeof Message.Type) => NoInfer<Message>
  /** `horizontal` puts the panels side by side, `vertical` one over the other. */
  readonly orientation?: 'horizontal' | 'vertical' | undefined
  /**
   * Default `'ltr'`. Under `'rtl'` a side-by-side split's first panel is on
   * the right, so ArrowLeft and a drag to the left grow it.
   */
  readonly direction?: 'ltr' | 'rtl' | undefined
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
  const lift = options.onMessage
  const builders = SlotView.buildersFor(
    ResizableSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const vertical = options.orientation === 'vertical'
  const { collapsible } = options
  const collapsed = Option.isSome(options.model.restore) && collapsible !== undefined
  const toggled = lift(Message.Toggled())
  const marked = (panel: 'first' | 'second') =>
    collapsed && collapsible === panel ? [h.DataAttribute('collapsed', '')] : []
  // A collapsed panel is a place the handle may stand, below the bounds a drag keeps.
  const least = Math.min(
    options.min ?? 0.1,
    collapsible === 'first' ? (options.collapsedTo ?? 0) : 1,
  )
  const most = Math.max(
    options.max ?? 0.9,
    collapsible === 'second' ? 1 - (options.collapsedTo ?? 0) : 0,
  )
  const across = options.direction === 'rtl' ? -1 : 1
  const step = options.step ?? 0.05
  const percent = Math.round(options.model.share * 100)
  const measured = Mount.mapMessage(Resize(), fact =>
    lift(Message.Measured({ size: vertical ? fact.height : fact.width })),
  )
  const dragged = Mount.mapMessage(Move(), fact =>
    lift(
      Match.valueTags(fact, {
        MoveStarted: () => Message.DragStarted(),
        Moved: ({ deltaX, deltaY }) =>
          Message.Dragged({ delta: vertical ? deltaY : deltaX * across }),
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
      // The keys' and the drag's direction is the drawing's, so the first panel is on the right.
      ...(options.direction === undefined ? [] : [h.Dir(options.direction)]),
      h.Style({ '--_fk-split': `${percent}%` }),
      // While dragged, the panels follow the pointer at once; otherwise they ease.
      ...(Option.isSome(options.model.from) ? [h.DataAttribute('dragging', '')] : []),
      h.OnMount(measured),
    ]),
    [
      h.div(builders.first.attrs(marked('first')), [options.first]),
      h.div(
        builders.handle.attrs([
          h.Role('separator'),
          // A separator's orientation is its own line's: a side-by-side split's is vertical.
          h.AriaOrientation(vertical ? 'horizontal' : 'vertical'),
          h.AriaLabel(options.label),
          h.AriaValuemin(Math.round(least * 100)),
          h.AriaValuemax(Math.round(most * 100)),
          h.AriaValuenow(percent),
          h.Tabindex(0),
          h.OnKeyDownSelfPreventDefault(pressed => {
            const key = readingKey(pressed, options.direction)
            if (key === 'Home') return Option.some(lift(Message.Set({ share: options.min ?? 0.1 })))
            if (key === 'End') return Option.some(lift(Message.Set({ share: options.max ?? 0.9 })))
            if (key === 'Enter' && collapsible !== undefined) return Option.some(toggled)
            return Option.map(Option.fromNullishOr(keys.get(key)), by =>
              lift(Message.Set({ share: options.model.share + by })),
            )
          }),
          ...(collapsible === undefined ? [] : [h.OnDoubleClick(toggled)]),
          h.OnMount(dragged),
          // A Mount reads its args once: a new direction draws a new handle.
          h.Key(options.direction ?? 'ltr'),
        ]),
        [h.span(builders.grip.attrs([h.AriaHidden(true)]), [])],
      ),
      h.div(builders.second.attrs(marked('second')), [options.second]),
    ],
  )
}
