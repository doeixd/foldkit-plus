/**
 * Compile-time SlotView contract. Type-checked, not executed.
 */
import type { HtmlBuilder } from 'foldkit/html'
import { Mixin, SlotView } from '../src/index.js'
import { FieldSlots } from './fixture.js'
import { h, type TestMessage } from './resolverFixture.js'

interface FieldInput {
  readonly label: string
}

const FieldView = SlotView.define(
  FieldSlots,
  (input: FieldInput, slots, h: HtmlBuilder<TestMessage>) =>
    h.div(slots.root.attrs([h.Value(input.label)])),
)

// @ts-expect-error unknown slot key.
const _missing = FieldView.slots.missing
void _missing

// @ts-expect-error the render input must match.
FieldView({ wrong: true }, h)

const Decoration = Mixin.make<TestMessage>('Decoration', { root: { classes: ['x'] } })
const _attached = FieldView.pipe(SlotView.attach(Decoration))
void _attached

// @ts-expect-error the render input must still match after attach.
_attached({ wrong: true }, h)

// @ts-expect-error a foreign Message universe cannot attach.
FieldView.pipe(SlotView.attach(Mixin.make<{ readonly _tag: 'Foreign' }>('Foreign', {})))

// `forMessages` fixes the Message universe, so `h` needs no annotation.
const MessageView = SlotView.forMessages<TestMessage>().define(
  FieldSlots,
  (input: FieldInput, slots, h) =>
    h.div(slots.root.attrs([h.Value(input.label), h.OnClick({ _tag: 'Clicked' })])),
)

const _fixed: SlotView.SlotView<typeof FieldSlots, FieldInput, TestMessage> = MessageView
void _fixed

MessageView.pipe(SlotView.attach(Decoration))

SlotView.forMessages<TestMessage>().define(FieldSlots, (_input: FieldInput, slots, h) =>
  // @ts-expect-error the fixed universe is the only Message `h` can emit.
  h.div(slots.root.attrs([h.OnClick({ _tag: 'Foreign' })])),
)

type ForeignMessage = { readonly _tag: 'Foreign' }

const foreignRender = (
  _input: FieldInput,
  _slots: SlotView.SlotBuilders<typeof FieldSlots, ForeignMessage>,
  h: HtmlBuilder<ForeignMessage>,
) => h.div([])

// @ts-expect-error a render over another Message universe cannot define a fixed view.
SlotView.forMessages<TestMessage>().define(FieldSlots, foreignRender)

// @ts-expect-error a foreign Message universe cannot attach to a fixed view either.
MessageView.pipe(SlotView.attach(Mixin.make<ForeignMessage>('Foreign', {})))

// @ts-expect-error the render input must match.
MessageView({ wrong: true }, h)

// A slot's attributes are typed as their base was, plus what a Mixin adds, which is never
// `InnerHTML`: a base fit for a textarea, or none, leaves them fit for one (#214).
SlotView.forMessages<TestMessage>().define(FieldSlots, (input: FieldInput, slots, h) =>
  h.div(slots.root.attrs(), [
    h.textarea(slots.input.attrs([h.Value(input.label), h.OnInput(() => ({ _tag: 'Clicked' }))])),
    // A base chosen between two lists infers both.
    h.textarea(slots.input.attrs(input.label === '' ? [h.Value('')] : [h.Rows(3), h.Value('x')])),
    h.textarea(slots.input.attrs()),
    // @ts-expect-error a base holding `InnerHTML` keeps it, and a textarea refuses it
    h.textarea(slots.input.attrs([h.InnerHTML('<b>x</b>')])),
  ]),
)
