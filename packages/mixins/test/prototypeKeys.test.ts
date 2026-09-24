import { describe, expect, it } from 'vitest'
import {
  Attributes,
  Capability,
  Mixin,
  Slot,
  SlotView,
  Slots,
  Style,
  type SlotAttributes,
} from '../src/index.js'
import { h, type TestMessage } from './resolverFixture.js'

const ProtoSlots = Slots.define({
  ['__proto__']: Slot.make({ capability: Capability.Container }),
})

const classValue = (attributes: SlotAttributes<TestMessage>): string | undefined =>
  Attributes.find(attributes, 'Class')?.value

const context = { input: undefined, h }

describe('prototype-key slot names', () => {
  it('applies a Style that targets a __proto__ slot', () => {
    const ProtoStyle = Style.forSlots(ProtoSlots)({ ['__proto__']: Style.class('proto') })
    const builders = SlotView.buildersFor(ProtoSlots, [ProtoStyle.mixin], context)
    expect(Object.hasOwn(builders, '__proto__')).toBe(true)
    expect(classValue(builders['__proto__'].attrs())).toBe('proto')
  })

  it('keeps a __proto__ contribution through Mixin.compose', () => {
    const A = Mixin.make<TestMessage>('A', { ['__proto__']: { classes: ['a'] } })
    const B = Mixin.make<TestMessage>('B', { ['__proto__']: { classes: ['b'] } })
    const builders = SlotView.buildersFor(ProtoSlots, [Mixin.compose(A, B)], context)
    expect(classValue(builders['__proto__'].attrs())).toBe('a b')
  })

  it('describes a __proto__ slot as an own key', () => {
    const described = Slots.describe(ProtoSlots)
    expect(Object.hasOwn(described.slots, '__proto__')).toBe(true)
    expect(described.slots['__proto__']?.capability).toBe('Container')
  })

  it('composes a __proto__ style property from untyped data', () => {
    // The Declarations type refuses `__proto__`; untyped JavaScript and parsed
    // data can still carry it, so the runtime must keep it as an own key.
    const parsed = JSON.parse('{"__proto__":"thin"}')
    const composed = Style.compose(Style.inline(parsed))
    expect(Object.hasOwn(composed.style, '__proto__')).toBe(true)
    expect(composed.style['__proto__']).toBe('thin')
  })
})
