import { describe, expect, it } from 'vitest'
import { Option } from 'effect'
import type { KeyboardModifiers } from 'foldkit/html'
import { Attributes, SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Message, initial, update } from '../src/number-field/app.js'
import { NumberField, NumberFieldSlots } from '../src/number-field/view.js'
import { runDemo } from '../src/number-field/view.js'

const plain: KeyboardModifiers = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }

describe('update flows', () => {
  it('starts at 3', () => {
    expect(initial.value).toBe(3)
  })

  it('clamps to the bounds', () => {
    expect(update(initial, Message.SetValue({ value: 11 })).model.value).toBe(10)
    expect(update(initial, Message.SetValue({ value: -2 })).model.value).toBe(0)
  })

  it('keeps the model when nothing changes', () => {
    expect(update(initial, Message.SetValue({ value: 3 })).model).toBe(initial)
  })
})

describe('view structure', () => {
  it('draws the spinbutton tied to its label and description', () => {
    const field = Inert.draw(NumberField, initial)
    const control = Inert.byRole(field, 'spinbutton')[0]
    expect(Inert.value(control, 'aria-valuenow')).toBe('3')
    expect(Inert.value(control, 'aria-valuemin')).toBe('0')
    expect(Inert.value(control, 'aria-valuemax')).toBe('10')
    expect(Inert.value(control, 'aria-labelledby')).toBe('quantity-label')
    expect(Inert.value(control, 'aria-describedby')).toBe('quantity-description')
    expect(Inert.text(field)).toContain('3')
  })

  it('ArrowUp steps through the behavior', () => {
    const h = SlotView.inertBuilder<Message>()
    const builders = SlotView.buildersFor(NumberFieldSlots, NumberField.mixins, {
      input: initial,
      h,
    })
    const key = Attributes.find(builders.control.attrs(), 'OnKeyDownPreventDefault') as unknown as {
      f: (key: string, modifiers: KeyboardModifiers) => Option.Option<Message>
    }
    if (key === undefined) throw new Error('no spin key handler on the control')
    expect(Option.getOrThrow(key.f('ArrowUp', plain))).toEqual(Message.SetValue({ value: 4 }))
    expect(Option.isNone(key.f('a', plain))).toBe(true)
  })
})

describe('demo', () => {
  it('traces clamping', () => {
    expect(runDemo()).toEqual(['start: value=3', 'set 11: value=10 (clamped)', 'set 0: value=0'])
  })
})
