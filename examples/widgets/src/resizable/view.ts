/**
 * The split as one SlotView over two Mounts, the grid's resize shape: a
 * `Resize` mount on the root reports the container's pixels for drag math,
 * and a `Move` mount on the separator reports deltas from where the drag
 * began. Keys step the share without either. The separator stays one tab
 * stop the keyboard can reach (the grid keeps its handles out only because
 * the grid itself is the tab stop).
 */
import { Match, Option } from 'effect'
import { Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import * as Mount from 'foldkit/mount'
import { Move } from 'foldkit-primitives/dom'
import { Resize } from 'foldkit-primitives/observers'
import { resizableStyle } from '../style.js'
import {
  MAX,
  MIN,
  STEP,
  clampShare,
  initial,
  percentOf,
  update,
  Message,
  type Model,
} from './app.js'

export const ResizableSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  first: Slot.make({ capability: Capability.Container }),
  handle: Slot.make({ capability: Capability.Interactive }),
  second: Slot.make({ capability: Capability.Container }),
})

const steps = new Map([
  ['ArrowLeft', -STEP],
  ['ArrowRight', STEP],
])

export const Resizable = SlotView.forMessages<Message>()
  .define(ResizableSlots, (model: Model, slots, h) => {
    const pct = percentOf(model.first)
    const measured = Mount.mapMessage(Resize(), fact => Message.Resized({ width: fact.width }))
    const dragged = Mount.mapMessage(Move(), fact =>
      Match.valueTags(fact, {
        MoveStarted: () => Message.DragStarted({}),
        Moved: ({ deltaX }) => Message.Dragged({ delta: deltaX }),
        MoveEnded: () => Message.DragEnded({}),
      }),
    )
    return h.div(slots.root.attrs([h.OnMount(measured)]), [
      h.div(slots.first.attrs([h.Style({ flex: `0 0 ${pct}%`, overflow: 'auto' })]), [
        h.ul([], [h.li([], ['notes.txt']), h.li([], ['todo.md']), h.li([], ['grid.ts'])]),
      ]),
      h.div(
        slots.handle.attrs([
          h.Role('separator'),
          h.AriaOrientation('vertical'),
          h.AriaLabel('Resize file list'),
          h.AriaValuemin(percentOf(MIN)),
          h.AriaValuemax(percentOf(MAX)),
          h.AriaValuenow(pct),
          h.Tabindex(0),
          h.OnKeyDownSelfPreventDefault((key, _modifiers) => {
            if (key === 'Home') return Option.some(Message.Sized({ first: MIN }))
            if (key === 'End') return Option.some(Message.Sized({ first: MAX }))
            return Option.map(Option.fromUndefinedOr(steps.get(key)), by =>
              Message.Sized({ first: clampShare(model.first + by) }),
            )
          }),
          h.OnMount(dragged),
        ]),
        [],
      ),
      h.div(slots.second.attrs([h.Style({ flex: '1', overflow: 'auto' })]), [
        h.p([], ['Pick a file to preview it.']),
      ]),
      h.p([], [`First panel ${pct}%.`]),
    ])
  })
  .pipe(Style.attach(resizableStyle(ResizableSlots)))

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial
  const lines = [`start: first=${model.first}`]
  model = update(model, Message.Sized({ first: 0.9 })).model
  lines.push(`sized 0.9: first=${model.first} (clamped)`)
  model = update(model, Message.Resized({ width: 600 })).model
  model = update(model, Message.DragStarted({})).model
  model = update(model, Message.Dragged({ delta: -120 })).model
  lines.push(`dragged -120 of 600: first=${model.first}`)
  return lines
}
