import { describe, expect, it } from 'vitest'
import {
  Attributes,
  Behaviors,
  Capability,
  Slot,
  Slots,
  SlotView,
  type SlotAttributes,
} from '../src/index.js'
import { h, type TestMessage } from './resolverFixture.js'

const { Disclosure, FieldAssociation, ToggleState } = Behaviors
type ToggleStateValue = Behaviors.ToggleState.State

const value = (attributes: SlotAttributes<TestMessage>, tag: Attributes.Tag): unknown => {
  const found = Attributes.find(attributes, tag) as { readonly value?: unknown } | undefined
  return found?.value
}

describe('Disclosure', () => {
  const Slots_ = Slots.define({
    summary: Slot.make({ capability: Capability.Interactive }),
    details: Slot.make({ capability: Capability.Container }),
  })
  interface Input {
    readonly open: boolean
  }
  const Expand = Disclosure.behavior(Slots_)<Input, TestMessage>({
    trigger: 'summary',
    content: 'details',
    open: input => input.open,
    id: () => 'faq-1',
  })
  const at = (open: boolean) => SlotView.buildersFor(Slots_, [Expand.mixin], { input: { open }, h })

  it('says the state on the trigger and names the content', () => {
    const open = at(true)
    expect(value(open.summary.attrs(), 'AriaExpanded')).toBe(true)
    expect(value(open.summary.attrs(), 'AriaControls')).toBe('faq-1')
    expect(value(open.details.attrs(), 'Id')).toBe('faq-1')
    expect(value(open.details.attrs(), 'Hidden')).toBe(false)
    const closed = at(false)
    expect(value(closed.summary.attrs(), 'AriaExpanded')).toBe(false)
    expect(value(closed.details.attrs(), 'Hidden')).toBe(true)
  })
})

describe('ToggleState', () => {
  const Slots_ = Slots.define({ box: Slot.make({ capability: Capability.Interactive }) })
  interface Input {
    readonly state: ToggleStateValue
  }
  const checked = ToggleState.behavior(Slots_)<Input, TestMessage>({
    control: 'box',
    state: input => input.state,
    as: 'checked',
  })
  const pressed = ToggleState.behavior(Slots_)<Input, TestMessage>({
    control: 'box',
    state: input => input.state,
    as: 'pressed',
  })
  const attrs = (behavior: typeof checked, state: ToggleStateValue) =>
    SlotView.buildersFor(Slots_, [behavior.mixin], { input: { state }, h }).box.attrs()

  it.each<[ToggleStateValue, unknown, string]>([
    [true, true, 'true'],
    [false, false, 'false'],
    ['mixed', 'mixed', 'mixed'],
  ])('state %s: aria-checked %s, aria-pressed %s', (state, checkedValue, pressedValue) => {
    expect(value(attrs(checked, state), 'AriaChecked')).toBe(checkedValue)
    expect(Attributes.find(attrs(checked, state), 'AriaPressed')).toBeUndefined()
    expect(value(attrs(pressed, state), 'AriaPressed')).toBe(pressedValue)
    expect(Attributes.find(attrs(pressed, state), 'AriaChecked')).toBeUndefined()
  })
})

describe('FieldAssociation', () => {
  const Slots_ = Slots.define({
    label: Slot.make({ capability: Capability.Base }),
    input: Slot.make({ capability: Capability.TextInput }),
    hint: Slot.make({ capability: Capability.Base }),
    problem: Slot.make({ capability: Capability.Base }),
  })
  interface Input {
    readonly invalid: boolean
    readonly required: boolean
  }
  const Tie = FieldAssociation.behavior(Slots_)<Input, TestMessage>({
    control: 'input',
    label: 'label',
    description: 'hint',
    error: 'problem',
    id: () => 'email',
    invalid: input => input.invalid,
    required: input => input.required,
  })
  const at = (input: Input) => SlotView.buildersFor(Slots_, [Tie.mixin], { input, h })

  it('derives every id from the base id', () => {
    expect(FieldAssociation.ids('email')).toEqual({
      control: 'email',
      label: 'email-label',
      description: 'email-description',
      error: 'email-error',
    })
  })

  it('labels and describes the control, adding the error only while invalid', () => {
    const valid = at({ invalid: false, required: true })
    const control = valid.input.attrs()
    expect(value(control, 'Id')).toBe('email')
    expect(value(control, 'AriaLabelledBy')).toBe('email-label')
    expect(value(control, 'AriaDescribedBy')).toBe('email-description')
    expect(Attributes.find(control, 'AriaInvalid')).toBeUndefined()
    expect(value(control, 'AriaRequired')).toBe(true)
    expect(value(valid.label.attrs(), 'Id')).toBe('email-label')
    expect(value(valid.label.attrs(), 'For')).toBe('email')
    expect(value(valid.hint.attrs(), 'Id')).toBe('email-description')
    expect(value(valid.problem.attrs(), 'Id')).toBe('email-error')

    const invalid = at({ invalid: true, required: false }).input.attrs()
    expect(value(invalid, 'AriaDescribedBy')).toBe('email-description email-error')
    expect(value(invalid, 'AriaInvalid')).toBe(true)
    expect(Attributes.find(invalid, 'AriaRequired')).toBeUndefined()
  })

  it('omits aria-describedby when there is nothing to describe with', () => {
    const Bare = FieldAssociation.behavior(Slots_)<Input, TestMessage>({
      control: 'input',
      label: 'label',
      id: () => 'name',
    })
    const control = SlotView.buildersFor(Slots_, [Bare.mixin], {
      input: { invalid: true, required: false },
      h,
    }).input.attrs()
    expect(Attributes.find(control, 'AriaDescribedBy')).toBeUndefined()
    expect(Attributes.find(control, 'AriaInvalid')).toBeUndefined()
  })
})
