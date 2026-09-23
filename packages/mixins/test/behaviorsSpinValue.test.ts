import { Option } from 'effect'
import type { KeyboardModifiers } from 'foldkit/html'
import { describe, expect, it } from 'vitest'
import { Attributes, Behaviors, Capability, Slot, Slots, SlotView } from '../src/index.js'
import { h } from './resolverFixture.js'

const { SpinValue } = Behaviors
const plain: KeyboardModifiers = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }
const bounds = { min: 0, max: 10, step: 2 }

describe('SpinValue.spin', () => {
  it.each<[string, number, number | undefined]>([
    ['ArrowUp', 4, 6],
    ['ArrowDown', 4, 2],
    ['ArrowUp', 10, 10],
    ['ArrowDown', 0, 0],
    ['PageUp', 0, 10],
    ['PageDown', 10, 0],
    ['Home', 7, 0],
    ['End', 7, 10],
    ['Enter', 7, undefined],
  ])('%s from %d', (key, value, expected) => {
    expect(SpinValue.spin(value, key, plain, bounds)).toBe(expected)
  })

  it('defaults the step to 1 and the page to ten steps, and leaves a chord alone', () => {
    expect(SpinValue.spin(0, 'ArrowUp', plain, {})).toBe(1)
    expect(SpinValue.spin(0, 'PageUp', plain, {})).toBe(10)
    expect(SpinValue.spin(0, 'ArrowUp', { ...plain, ctrlKey: true }, {})).toBeUndefined()
    expect(SpinValue.spin(5, 'Home', plain, {})).toBeUndefined()
  })
})

describe('SpinValue.behavior', () => {
  type Message = { readonly _tag: 'Changed'; readonly value: number }
  const Slots_ = Slots.define({ field: Slot.make({ capability: Capability.TextInput }) })
  interface Input {
    readonly quantity: number
  }
  const Stepper = SpinValue.behavior(Slots_)<Input, Message>({
    control: 'field',
    value: input => input.quantity,
    onChange: value => ({ _tag: 'Changed', value }),
    min: 1,
    max: 5,
    text: input => `${input.quantity} items`,
  })
  const hh = SlotView.inertBuilder<Message>()
  const attrs = (quantity: number) =>
    SlotView.buildersFor(Slots_, [Stepper.mixin], { input: { quantity }, h: hh }).field.attrs()

  it('writes the spinbutton role and values', () => {
    const a = attrs(3)
    expect(Attributes.find(a, 'Role')?.value).toBe('spinbutton')
    expect(Attributes.find(a, 'AriaValuenow')?.value).toBe(3)
    expect(Attributes.find(a, 'AriaValuemin')?.value).toBe(1)
    expect(Attributes.find(a, 'AriaValuemax')?.value).toBe(5)
    expect(Attributes.find(a, 'AriaValuetext')?.value).toBe('3 items')
  })

  it('steps with the keys and stays silent at a bound or on another key', () => {
    const f = Attributes.find(attrs(3), 'OnKeyDownPreventDefault')?.f
    if (f === undefined) throw new Error('no key handler')
    expect(Option.getOrThrow(f('ArrowUp', plain))).toEqual({ _tag: 'Changed', value: 4 })
    expect(Option.getOrThrow(f('End', plain))).toEqual({ _tag: 'Changed', value: 5 })
    expect(Option.isNone(f('a', plain))).toBe(true)
    const atMax = Attributes.find(attrs(5), 'OnKeyDownPreventDefault')?.f
    expect(Option.isNone(atMax!('ArrowUp', plain))).toBe(true)
  })
  void h
})
