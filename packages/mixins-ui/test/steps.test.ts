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

  it('hides the number, which the list position already says', () => {
    const drawn = Steps.view({ label: 'Checkout', steps, current: 2, style }, h)
    const markers = Inert.byTag(drawn, 'span').filter(span => Inert.text(span) === '1')
    expect(markers.map(marker => Inert.value(marker, 'aria-hidden'))).toEqual(['true'])
  })

  it('makes completed steps buttons that go back, only when asked', () => {
    const asked: Array<number> = []
    const offered = Steps.view(
      {
        label: 'Checkout',
        steps,
        current: 2,
        onSelect: index => {
          asked.push(index)
          return message('Clicked')
        },
        style,
      },
      h,
    )
    const buttons = Inert.byTag(offered, 'button')
    expect(buttons.map(Inert.text)).toEqual(['1AccountYour details', '2Plan'])
    expect(asked).toEqual([0, 1])
    expect(buttons.map(button => Inert.value(button, 'type'))).toEqual(['button', 'button'])
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

  it('draws a step’s icon in its marker in place of the number', () => {
    const drawn = Steps.view(
      {
        label: 'Checkout',
        steps: [{ title: 'Account', icon: h.span([], ['☺']) }, { title: 'Plan' }],
        current: 0,
        style,
      },
      h,
    )
    const [first, second] = Inert.byTag(drawn, 'li')
    expect(Inert.text(first)).toBe('☺Account')
    expect(Inert.text(second)).toBe('2Plan')
  })

  it('draws a step’s content after it, before the line, with its state', () => {
    const drawn = Steps.view(
      {
        label: 'Checkout',
        steps: [{ title: 'Account', content: h.p([], ['Your email']) }, { title: 'Plan' }],
        current: 0,
        style,
      },
      h,
    )
    const [first, second] = Inert.byTag(drawn, 'li')
    const children = Inert.children(first)
    expect(children).toHaveLength(3)
    expect(Inert.text(children[1])).toBe('Your email')
    expect(Inert.value(children[1], 'data-state')).toBe('current')
    expect(Inert.children(second)).toHaveLength(1)
  })
})

describe('Steps recipe', () => {
  const css = (selection: Parameters<typeof Recipes.Steps>[0]) =>
    Style.forSlots(StepsSlots)(Recipes.Steps(selection)).css

  it('sizes the marker on the Avatar’s steps', () => {
    expect(css({})).toContain('--_fk-steps-marker:1.75rem')
    expect(css({ size: 'sm' })).toContain('--_fk-steps-marker:1.5rem')
    expect(css({ size: 'lg' })).toContain('--_fk-steps-marker:2.5rem')
  })

  it('hides an icon under the check once its step is complete', () => {
    expect(css({})).toMatch(/\[data-state="complete"\] > \*\{visibility:hidden/)
  })

  it('lays content beside the line when vertical, and draws none in a row', () => {
    expect(css({ orientation: 'vertical' })).toMatch(/grid-column:2;grid-row:2/)
    expect(css({ orientation: 'vertical' })).toMatch(/grid-column:1;grid-row:2/)
    expect(css({ orientation: 'horizontal' })).toMatch(/\{display:none\}/)
  })

  it('below the narrow width, only the current step keeps its label and its share', () => {
    const row = css({ orientation: 'horizontal' })
    expect(row).toContain('@container (max-width: 32rem)')
    expect(row).toMatch(
      /:where\(\[data-state\]:not\(\[aria-current="step"\]\)\) > \* > [^{]+\{[^}]*position:absolute/,
    )
    expect(row).toMatch(
      /:where\(\[data-state\]:not\(\[aria-current="step"\]\)\)[^{]+\{[^}]*flex:0 0 auto/,
    )
  })
})
