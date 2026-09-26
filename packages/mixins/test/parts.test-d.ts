/**
 * Compile-time contract of parts: a part is given only what it reads, and its
 * Behaviors are declared over that. Type-checked, not executed.
 */
import type { HtmlBuilder } from 'foldkit/html'
import { Behavior, SlotView } from '../src/index.js'
import { FieldSlots } from './fixture.js'
import type { TestMessage } from './resolverFixture.js'

interface Input {
  readonly label: string
  readonly count: number
}

const Parts = SlotView.parts(FieldSlots)<Input, TestMessage>()

Parts.part('Label', { reads: ['label'] }, (input, slots, h) =>
  h.div(slots.root.attrs(), [input.label]),
)

Parts.part('Label', { reads: ['label'] }, (input, slots, h) =>
  // @ts-expect-error a part is not given what it does not read.
  h.div(slots.root.attrs(), [String(input.count)]),
)

// @ts-expect-error a part reads only the input's keys.
Parts.part('Missing', { reads: ['missing'] }, (_input, slots, h) => h.div(slots.root.attrs()))

const OverCount = Behavior.forSlots(FieldSlots)<Pick<Input, 'count'>, TestMessage>({
  root: Behavior.slot({ attributes: ({ input, h }) => [h.Value(String(input.count))] }),
})
Parts.part('Count', { reads: ['count'], behaviors: [OverCount] }, (_input, slots, h) =>
  h.div(slots.root.attrs()),
)
Parts.part(
  'Label',
  // @ts-expect-error a part's Behavior reads only what the part reads.
  { reads: ['label'], behaviors: [OverCount] },
  (_input, slots, h) => h.div(slots.root.attrs()),
)

// An item's arguments are the drawing's own, checked against its parameters.
const drawLabel = (
  slots: SlotView.SlotBuilders<typeof FieldSlots, TestMessage>,
  h: HtmlBuilder<TestMessage>,
  label: string,
) => h.div(slots.root.attrs(), [label])
Parts.part('Rows', { reads: ['label', 'count'] }, (input, slots) =>
  slots.root.lazy({ index: 0 }, drawLabel, [input.label]),
)
Parts.part('Rows', { reads: ['label', 'count'] }, (input, slots) =>
  // @ts-expect-error a count is not the label the drawing takes.
  slots.root.lazy({ index: 0 }, drawLabel, [input.count]),
)
