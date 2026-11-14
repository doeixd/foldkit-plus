/**
 * `SlotView.over` at run time: its `define`, `behavior` and `parts` are the
 * constructors they stand for, with the slots fixed, and `isBound` tells a
 * binder from bare slots.
 */
import { describe, expect, it } from 'vitest'
import { Attributes, Behavior, Capability, Slot, SlotView, Slots } from '../src/index.js'
import { DiagnosticError } from '../src/diagnostics.js'
import { FieldSlots } from './fixture.js'
import { h, type TestMessage } from './resolverFixture.js'

interface FieldInput {
  readonly label: string
}

const Field = SlotView.over(FieldSlots)<FieldInput, TestMessage>()

describe('SlotView.over', () => {
  it('defines a view over its slots, named as asked', () => {
    const view = Field.define((input, slots, h) => h.div(slots.root.attrs(), [input.label]), {
      name: 'Field',
    })
    expect(view.slots).toBe(FieldSlots)
    expect(view.name).toBe('Field')
    expect(view({ label: 'x' }, h)).not.toBeNull()
  })

  it('makes Behaviors over its slots that attach to its views', () => {
    const Labels = Field.behavior(
      { input: { attributes: ({ input, h }) => [h.AriaLabel(input.label)] } },
      { name: 'Labels' },
    )
    expect(Labels.name).toBe('Labels')
    const view = Field.define((_, slots, h) => h.div(slots.root.attrs())).pipe(
      Behavior.attach(Labels),
    )
    const builders = SlotView.buildersFor(view.slots, view.mixins, { input: { label: 'Name' }, h })
    expect(Attributes.find(builders.input.attrs(), 'AriaLabel')?.value).toBe('Name')
  })

  it('refuses a slot the contract does not publish, as forSlots does', () => {
    expect(() => Field.behavior({ nope: {} } as never)).toThrow(DiagnosticError)
  })

  it('makes parts over its slots', () => {
    const Label = Field.parts.part('Label', { reads: ['label'] }, (input, slots, h) =>
      h.span(slots.label.attrs(), [input.label]),
    )
    expect(Label.reads).toEqual(['label'])
    expect(
      Field.parts.assemble((_, slots, h, draw) => h.div(slots.root.attrs(), [draw(Label)])).slots,
    ).toBe(FieldSlots)
  })

  it('isBound tells a binder from bare slots, a slot named `slots` included', () => {
    const Tricky = Slots.define({ slots: Slot.make({ capability: Capability.Container }) })
    expect(SlotView.isBound(Field)).toBe(true)
    expect(SlotView.isBound(FieldSlots)).toBe(false)
    expect(SlotView.isBound(Tricky)).toBe(false)
    expect(SlotView.isBound(SlotView.over(Tricky)<FieldInput, TestMessage>())).toBe(true)
  })
})
