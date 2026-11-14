/**
 * Compile-time contract of `SlotView.over`: the slots, the input and the
 * Message universe are named once, and nothing passed to the binder is
 * annotated. Type-checked, not executed.
 */
import { pipe } from 'effect'
import { Behavior, SlotView, Style } from '../src/index.js'
import { FieldSlots } from './fixture.js'
import type { TestMessage } from './resolverFixture.js'

interface FieldInput {
  readonly label: string
  readonly invalid: boolean
}

const Field = SlotView.over(FieldSlots)<FieldInput, TestMessage>()

const behaviorOf = (name: string) =>
  Field.behavior(
    { input: { attributes: ({ input, h }) => [h.AriaInvalid(input.invalid)] } },
    { name },
  )
const Look = Style.forSlots(FieldSlots)({ root: { display: 'grid' } })

// Six attachments infer through `pipe` with nothing annotated, the Behaviors written inline.
const FieldView = Field.define((input, slots, h) =>
  h.div(slots.root.attrs(), [h.span(slots.label.attrs(), [input.label])]),
).pipe(
  Style.attach(Look),
  Behavior.attach(
    Field.behavior({ root: { attributes: ({ h }) => [h.OnClick({ _tag: 'Clicked' })] } }),
  ),
  Behavior.attach(
    Field.behavior({
      input: Behavior.slot({ attributes: ({ input, h }) => [h.AriaLabel(input.label)] }),
    }),
  ),
  Behavior.attach(behaviorOf('Three')),
  Behavior.attach(
    Field.behavior({ label: { mount: input => ({ name: input.label, f: () => null as never }) } }),
  ),
  SlotView.detach('Three'),
)
const _view: SlotView.SlotView<typeof FieldSlots, FieldInput, TestMessage> = FieldView
void _view

// And hoisted, through Effect's `pipe`.
const Hoisted = Field.behavior({ root: { attributes: ({ h }) => [h.OnClick({ _tag: 'Other' })] } })
const _piped: SlotView.SlotView<typeof FieldSlots, FieldInput, TestMessage> = pipe(
  Field.define((input, slots, h) => h.div(slots.root.attrs(), [input.label])),
  Behavior.attach(Hoisted),
  SlotView.replace('Behavior', Hoisted.mixin),
)
void _piped

// A part's Behaviors and render are typed from the binder too.
Field.parts.part('Label', { reads: ['label'] }, (input, slots, h) =>
  h.span(slots.label.attrs(), [input.label]),
)

// The old call still compiles beside it.
void Behavior.forSlots(FieldSlots)<FieldInput, TestMessage>({})

// @ts-expect-error a slot the contract does not publish.
Field.behavior({ nope: {} })

Field.behavior({
  input: {
    // @ts-expect-error a field the input lacks.
    attributes: ({ input, h }) => [h.AriaLabel(input.missing)],
  },
})

Field.behavior({
  root: {
    // @ts-expect-error a Message outside the universe.
    attributes: ({ h }) => [h.OnClick({ _tag: 'Elsewhere' })],
  },
})

Field.define((input, slots, h) =>
  // @ts-expect-error the render is given the bound input.
  h.div(slots.root.attrs(), [input.missing]),
)

type OtherMessage = { readonly _tag: 'Elsewhere' }
const Other = SlotView.over(FieldSlots)<FieldInput, OtherMessage>()
const Elsewhere = Other.behavior({
  root: { attributes: ({ h }) => [h.OnClick({ _tag: 'Elsewhere' })] },
})
// @ts-expect-error a Behavior from a binder over another Message universe.
FieldView.pipe(Behavior.attach(Elsewhere))

// `isBound` tells a binder from bare slots for a factory that takes either.
const slotsOf = <Slots, Input, Message>(
  given: Slots | SlotView.Bound<Slots, Input, Message>,
): Slots => (SlotView.isBound(given) ? given.slots : given)
const _slots: typeof FieldSlots = slotsOf(Field)
void _slots
