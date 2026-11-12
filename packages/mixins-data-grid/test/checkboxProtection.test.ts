import { Resolver, SlotView } from 'foldkit-mixins'
import { expect, test } from 'vitest'
import { GridSlots } from '../src/index.js'

const h = SlotView.inertBuilder<never>()

// Presses are routed by `data-grid-checkbox`, so no Mixin may set it, however it is spelled.
test.each([
  ['DataAttribute', () => h.DataAttribute('grid-checkbox', 'x')],
  ['Attribute', () => h.Attribute('data-grid-checkbox', 'x')],
])('the checkbox Slot refuses a Mixin setting data-grid-checkbox through %s', (_name, make) => {
  expect(() =>
    Resolver.resolve([], [{ attributes: [make()] }], {
      slot: 'checkbox',
      protected: GridSlots.checkbox.protected,
    }),
  ).toThrow(/protects attribute/)
})
