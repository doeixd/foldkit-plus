/**
 * NumberField as markup and as arithmetic: where a value settles, and the
 * spinbutton the view draws for it, with its steppers out of the tab order
 * and disabled at their bound.
 */
import { describe, expect, it } from 'vitest'
import { A11y, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { NumberField, NumberFieldSlots, Patterns, Recipes } from '../src/index.js'
import { h, message } from './fixture.js'

const style = Style.forSlots(NumberFieldSlots)(Recipes.NumberField({}))
const drawn = (value: number) =>
  NumberField.view(
    {
      id: 'servings',
      label: 'Servings',
      description: 'From 1 to 12.',
      value,
      onChange: () => message('Clicked'),
      min: 1,
      max: 12,
      style,
    },
    h,
  )

describe('NumberField.settled', () => {
  it.each([
    ['clamps below the minimum', -4, { min: 0, max: 10 }, 0],
    ['clamps above the maximum', 14, { min: 0, max: 10 }, 10],
    ['keeps a value on the step counted from the minimum', 7, { min: 1, step: 3 }, 7],
    ['rounds a value between steps to the nearer', 5.4, { min: 1, step: 3 }, 4],
    ['keeps a decimal step exact', 0.30000000000000004, { step: 0.1 }, 0.3],
  ] as const)('%s', (_, value, bounds, after) => {
    expect(NumberField.settled(value, bounds)).toBe(after)
  })
})

describe('NumberField.view', () => {
  it('meets the number field pattern', () => {
    expect(A11y.validate(Patterns.NumberField, NumberFieldSlots)).toEqual([])
  })

  it('draws a spinbutton named by its label and described, with its bounds', () => {
    const [input] = Inert.byTag(drawn(3), 'input')
    const [label] = Inert.byTag(drawn(3), 'label')
    expect(Inert.value(input, 'role')).toBe('spinbutton')
    expect(Inert.value(label, 'for')).toBe(Inert.value(input, 'id'))
    expect([Inert.value(input, 'aria-valuemin'), Inert.value(input, 'aria-valuemax')]).toEqual([
      '1',
      '12',
    ])
    expect(Inert.value(input, 'aria-describedby')).toBe('servings-description')
  })

  it('keeps its steppers out of the tab order, and disables the one at its bound', () => {
    const [decrease, increase] = Inert.byTag(drawn(1), 'button')
    expect(Inert.value(decrease, 'tabindex')).toBe('-1')
    expect(Inert.value(decrease, 'disabled')).toBeDefined()
    expect(decrease?.data?.on?.['click']).toBeUndefined()
    expect(increase?.data?.on?.['click']).toBeTypeOf('function')
  })
})
