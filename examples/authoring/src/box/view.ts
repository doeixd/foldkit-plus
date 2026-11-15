/**
 * The box as one SlotView. The box and its resize handle are siblings, since a
 * press on the handle would otherwise bubble into the box's own `Move` and
 * start a move beside the resize. Each takes one keydown owner (`Keys`, with
 * the primitive's nudge or resize route) and one `Move` for the pointer; both
 * hand the application a delta, and `update` decides what it means.
 */
import { Match } from 'effect'
import {
  Behavior,
  Behaviors,
  Capability,
  Event,
  Slot,
  Slots,
  SlotView,
  Style,
} from 'foldkit-mixins'
import { Move } from 'foldkit-primitives/interaction'
import { control, focus, panel, t } from '../style.js'
import { AREA, GRID, Message, describe, type Model } from './app.js'

const { Keys } = Behaviors

export const BoxSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  area: Slot.make({ capability: Capability.Container }),
  box: Slot.make({ capability: Capability.Draggable, events: [Event.KeyDown] }),
  handle: Slot.make({ capability: Capability.Draggable, events: [Event.KeyDown] }),
  readout: Slot.make({ capability: Capability.Container }),
})

const BoxView = SlotView.over(BoxSlots)<Model, Message>()

/** A drag's facts as the Messages `update` reads, for the mode the slot it came from means. */
const dragOf = (mode: 'move' | 'resize') => (fact: Move.Fact) =>
  Match.valueTags(fact, {
    MoveStarted: () => Message.DragStarted({ mode }),
    Moved: ({ deltaX, deltaY }) => Message.Dragged({ dx: deltaX, dy: deltaY }),
    MoveEnded: ({ completed }) => Message.DragEnded({ completed }),
  })

export const BoxKeys = Keys.behavior(BoxView)({
  slot: 'box',
  name: 'BoxKeys',
  routes: [
    Move.nudge<Model, Message>({
      step: GRID,
      toMessage: ({ dx, dy }) => Message.Nudged({ dx, dy }),
    }),
  ],
})

export const HandleKeys = Keys.behavior(BoxView)({
  slot: 'handle',
  name: 'HandleKeys',
  routes: [
    Move.resizeKeys<Model, Message>('se', {
      step: GRID,
      toMessage: ({ dx, dy }) => Message.ResizedByKey({ dx, dy }),
    }),
  ],
})

export const MovesBox = Move.behavior(BoxView)({ handle: 'box', toMessage: dragOf('move') })
export const ResizesBox = Move.behavior(BoxView)({
  handle: 'handle',
  toMessage: dragOf('resize'),
})

export const BoxStyle = Style.forSlots(BoxSlots)(
  {
    root: Style.self({ display: 'grid', gap: t.space.xs, justifyItems: 'start' }),
    area: Style.compose(
      panel,
      Style.self({
        position: 'relative',
        // The reset is border-box: the area's inside, where the box is placed, must be the bounds.
        boxSizing: 'content-box',
        inlineSize: `${AREA.right - AREA.left}px`,
        blockSize: `${AREA.bottom - AREA.top}px`,
        // The grid the box snaps to, drawn from the same number `update` snaps by.
        backgroundImage: `linear-gradient(to right, ${t.outline.default} 1px, transparent 1px), linear-gradient(to bottom, ${t.outline.default} 1px, transparent 1px)`,
        backgroundSize: 'var(--grid) var(--grid)',
        opacity: '1',
      }),
    ),
    box: Style.compose(
      control,
      focus,
      Style.self({
        position: 'absolute',
        insetInlineStart: 'var(--box-x)',
        insetBlockStart: 'var(--box-y)',
        inlineSize: 'var(--box-width)',
        blockSize: 'var(--box-height)',
        cursor: 'grab',
        touchAction: 'none',
        boxSizing: 'border-box',
      }),
    ),
    handle: Style.compose(
      control,
      focus,
      Style.self({
        position: 'absolute',
        insetInlineStart: 'calc(var(--box-x) + var(--box-width))',
        insetBlockStart: 'calc(var(--box-y) + var(--box-height))',
        inlineSize: t.space.md,
        blockSize: t.space.md,
        padding: '0',
        translate: '-50% -50%',
        cursor: 'nwse-resize',
        touchAction: 'none',
      }),
    ),
    readout: Style.self({ margin: '0' }),
  },
  { name: 'BoxStyle' },
)

const px = (value: number): string => `${value}px`

export const MovableBox = BoxView.define((model, slots, h) => {
  const { rect } = model
  const place = h.Style({
    '--box-x': px(rect.x),
    '--box-y': px(rect.y),
    '--box-width': px(rect.width),
    '--box-height': px(rect.height),
  })
  return h.div(slots.root.attrs(), [
    h.div(slots.area.attrs([h.Style({ '--grid': px(GRID) })]), [
      h.button(
        slots.box.attrs([
          place,
          h.Type('button'),
          h.AriaLabel('Box'),
          h.AriaKeyshortcuts('Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight'),
        ]),
        ['Box'],
      ),
      h.button(slots.handle.attrs([place, h.Type('button'), h.AriaLabel('Resize the box')]), []),
    ]),
    h.p(slots.readout.attrs([h.Role('status')]), [describe(rect)]),
  ])
}).pipe(
  Behavior.attach(BoxKeys),
  Behavior.attach(HandleKeys),
  Behavior.attach(MovesBox),
  Behavior.attach(ResizesBox),
  Style.attach(BoxStyle),
)
