/**
 * The Quick start from this package's README, type-checked so the
 * documentation cannot drift from the API.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Attr, Behavior, Capability, Event, Slot, Slots, SlotView, Style } from '../src/index.js'
import { Inert } from '../src/testing.js'

const Message = defineMessageUnion({ ChangedValue: { value: Schema.String } })
type Message = typeof Message.Type

type FieldInput = { readonly value: string; readonly invalid: boolean }

const FieldSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  input: Slot.make({
    capability: Capability.TextInput,
    events: [Event.Input],
    attributes: [Attr.AriaInvalid],
  }),
})

const FieldStyle = Style.forSlots(FieldSlots)({
  root: Style.compose(Style.class('field'), Style.inline({ display: 'grid' })),
  input: Style.class('field-input'),
})

const Validation = Behavior.forSlots(FieldSlots)<FieldInput, Message>({
  input: Behavior.slot({
    requires: { capability: Capability.TextInput, attributes: [Attr.AriaInvalid] },
    attributes: ({ input, h }) => [h.AriaInvalid(input.invalid)],
  }),
})

const Field = SlotView.forMessages<Message>()
  .define(FieldSlots, (input: FieldInput, slots, h) =>
    h.label(slots.root.attrs(), [
      h.input(
        slots.input.attrs([
          h.Value(input.value),
          h.OnInput(value => Message.ChangedValue({ value })),
        ]),
      ),
    ]),
  )
  .pipe(Style.attach(FieldStyle), Behavior.attach(Validation))
void Field

// "Testing and static output": what a whole view draws, read with `Inert`.
{
  const Probe = SlotView.forMessages<Message>()
    .define(FieldSlots, (field: FieldInput, slots, h) =>
      h.input(slots.input.attrs([h.Value(field.value)])),
    )
    .pipe(Style.attach(FieldStyle), Behavior.attach(Validation))
  const root = Probe({ value: 'Ada', invalid: false }, SlotView.inertBuilder<Message>())
  void Inert.value(Inert.byTag(root, 'input')[0], 'value')
}

// "Parts: redraw only what changed".
const PanelSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  count: Slot.make({ capability: Capability.Container }),
})
type Input = { readonly title: string; readonly count: number }
const Parts = SlotView.parts(PanelSlots)<Input, Message>()

const Title = Parts.part('Title', { reads: ['title'] }, (input, slots, h) =>
  h.h2(slots.title.attrs(), [input.title]),
)
const Count = Parts.part('Count', { reads: ['count'] }, (input, slots, h) =>
  h.p(slots.count.attrs(), [String(input.count)]),
)
const Panel = Parts.assemble((input, slots, h, draw) =>
  h.section(slots.root.attrs(), [draw(Title), draw(Count)]),
)
void Panel

const ListSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Focusable }),
})
const ListParts = SlotView.parts(ListSlots)<{ readonly rows: ReadonlyArray<string> }, Message>()
const drawRow = (
  slots: SlotView.SlotBuilders<typeof ListSlots, Message>,
  h: HtmlBuilder<Message>,
  index: number,
  text: string,
) => h.li(slots.row.attrs([h.Key(text)], { index, id: text }), [text])

const Rows = ListParts.part('Rows', { reads: ['rows'] }, (input, slots, h) =>
  h.ul(
    slots.root.attrs(),
    input.rows.map((text, index) => slots.row.lazy({ index, id: text }, drawRow, [index, text])),
  ),
)
void Rows
