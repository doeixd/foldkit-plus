/**
 * Steps as markup: a named ordered list whose current step alone is
 * `aria-current`, the steps before it complete and after it upcoming, a
 * button only on a completed step and only when going back is offered, and
 * no connector after the last step.
 */
import { describe, expect, it } from 'vitest'
import { A11y, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Patterns, Recipes, Steps, StepsSlots } from '../src/index.js'
import { h, message } from './fixture.js'

const style = Style.forSlots(StepsSlots)(Recipes.Steps({ orientation: 'vertical' }))
const steps = [
  { title: 'Account', description: 'Your details' },
  { title: 'Plan' },
  { title: 'Payment' },
  { title: 'Review' },
]

describe('Steps.view', () => {
  it('meets the steps pattern', () => {
    expect(A11y.validate(Patterns.Steps, StepsSlots)).toEqual([])
  })

  it('names the list and marks the current step, those before complete', () => {
    const drawn = Steps.view({ label: 'Checkout', steps, current: 2, style }, h)
    const [list] = Inert.byTag(drawn, 'ol')
    const items = Inert.byTag(drawn, 'li')
    expect(Inert.value(list, 'aria-label')).toBe('Checkout')
    expect(items.map(item => Inert.value(item, 'data-state'))).toEqual([
      'complete',
      'complete',
      'current',
      'upcoming',
    ])
    expect(items.map(item => Inert.value(item, 'aria-current'))).toEqual([
      undefined,
      undefined,
      'step',
      undefined,
    ])
    expect(Inert.text(items[0])).toBe('1AccountYour details')
  })

  it('makes completed steps buttons that go back, only when asked', () => {
    const offered = Steps.view(
      { label: 'Checkout', steps, current: 2, onSelect: () => message('Clicked'), style },
      h,
    )
    const buttons = Inert.byTag(offered, 'button')
    expect(buttons.map(Inert.text)).toEqual(['1AccountYour details', '2Plan'])
    expect(buttons[1]?.data?.on?.['click']).toBeTypeOf('function')
    const plain = Steps.view({ label: 'Checkout', steps, current: 2, style }, h)
    expect(Inert.byTag(plain, 'button')).toEqual([])
  })

  it('completes every step past the last, and joins them with one line fewer', () => {
    const drawn = Steps.view({ label: 'Checkout', steps, current: 4, style }, h)
    const items = Inert.byTag(drawn, 'li')
    expect(items.map(item => Inert.value(item, 'data-state'))).toEqual(steps.map(() => 'complete'))
    expect(items.map(item => Inert.children(item).length)).toEqual([2, 2, 2, 1])
  })
})
