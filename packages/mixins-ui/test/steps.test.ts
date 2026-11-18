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
import { h, message, type TestMessage } from './fixture.js'

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
    expect(Inert.text(items[0])).toBe('1AccountCompletedYour details')
  })

  it('carries the current step’s progress, held between 0 and 1, only when given', () => {
    const progress = (value: number | undefined) =>
      Inert.style(
        Inert.byTag(
          Steps.view({ label: 'Checkout', steps, current: 2, progress: value, style }, h),
          'ol',
        )[0],
      )['--fk-steps-progress']
    expect([progress(0.3), progress(1.5), progress(-1), progress(undefined)]).toEqual([
      '0.3',
      '1',
      '0',
      undefined,
    ])
  })

  it('says where each step stands in words, the current one by aria-current alone', () => {
    const wordsOf = (words?: Partial<Steps.StepsWords>) =>
      Inert.byTag(Steps.view({ label: 'Checkout', steps, current: 1, words, style }, h), 'span')
        .filter(span =>
          ['Completed', 'Upcoming', 'Done', 'Here', 'Later'].includes(Inert.text(span)),
        )
        .map(span => Inert.text(span))
    expect(wordsOf()).toEqual(['Completed', 'Upcoming', 'Upcoming'])
    expect(wordsOf({ complete: 'Done', current: 'Here', upcoming: 'Later' })).toEqual([
      'Done',
      'Here',
      'Later',
      'Later',
    ])
  })

  it('hides the number, which the list position already says', () => {
    const drawn = Steps.view({ label: 'Checkout', steps, current: 2, style }, h)
    // The marker, not the number inside it, which the marker hides with it.
    const markers = Inert.byTag(drawn, 'span').filter(
      span => Inert.text(span) === '1' && Inert.value(span, 'data-number') === undefined,
    )
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
    expect(buttons.map(Inert.text)).toEqual(['1AccountCompletedYour details', '2PlanCompleted'])
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
    expect(Inert.text(second)).toBe('2PlanUpcoming')
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

describe('Steps.view, a step’s own state, trailing and configure', () => {
  const view = (more: Partial<Steps.StepsView<TestMessage>> = {}) =>
    Steps.view({ label: 'Checkout', steps, current: 1, style, ...more }, h)

  it('draws the state a step states in place of the one `current` gives, aria-current staying by position', () => {
    const drawn = view({
      steps: [
        { title: 'A' },
        { title: 'B', state: 'loading' },
        { title: 'C', state: 'complete' },
        { title: 'D', state: 'error' },
      ],
    })
    const items = Inert.byTag(drawn, 'li')
    expect(items.map(item => Inert.value(item, 'data-state'))).toEqual([
      'complete',
      'loading',
      'complete',
      'error',
    ])
    expect(items.map(item => Inert.value(item, 'aria-current'))).toEqual([
      undefined,
      'step',
      undefined,
      undefined,
    ])
    expect(Inert.text(items[1])).toContain('In progress')
    expect(Inert.text(items[3])).toContain('Failed')
  })

  it('makes a step that states itself complete a button that goes back', () => {
    const drawn = view({
      steps: [{ title: 'A', state: 'upcoming' }, { title: 'B' }, { title: 'C', state: 'complete' }],
      onSelect: () => message('Clicked'),
    })
    expect(Inert.byTag(drawn, 'button').map(button => Inert.text(button))).toContain('3CCompleted')
    expect(Inert.byTag(drawn, 'button')).toHaveLength(1)
  })

  it('draws a step’s trailing Html at the end of its row, with the state', () => {
    const drawn = view({
      steps: [{ title: 'A', trailing: h.span([], ['09:30']) }, { title: 'B' }],
    })
    const [first, second] = Inert.byTag(drawn, 'li')
    const row = Inert.children(first)[0]
    expect(Inert.text(Inert.children(row!).at(-1))).toBe('09:30')
    expect(Inert.value(Inert.children(row!).at(-1), 'data-state')).toBe('complete')
    expect(Inert.text(second)).not.toContain('09:30')
  })

  it('merges its words over the defaults key by key', () => {
    const drawn = view({ words: { error: 'Problem' }, steps: [{ title: 'A', state: 'error' }] })
    expect(Inert.text(Inert.byTag(drawn, 'li')[0])).toContain('Problem')
  })

  it('configures the look and words once, the call over both', () => {
    const App = Steps.configure({
      base: { style, words: { complete: 'Fait' } },
      presets: { calm: { words: { upcoming: 'Plus tard' } } },
    })
    const text = (preset: 'calm' | undefined, words?: Partial<Steps.StepsWords>) =>
      Inert.text(
        App.view({ label: 'x', steps, current: 1, ...(preset ? { preset } : {}), words }, h),
      )
    expect(text(undefined)).toContain('Fait')
    expect(text('calm')).toContain('Plus tard')
    expect(text('calm', { complete: 'Vu' })).toContain('Vu')
    expect(text('calm', { complete: 'Vu' })).not.toContain('Fait')
  })
})

describe('Steps recipe', () => {
  const css = (selection: Parameters<typeof Recipes.Steps>[0]) =>
    Style.forSlots(StepsSlots)(Recipes.Steps(selection)).css

  it('hides an icon under the check once its step is complete', () => {
    expect(css({})).toMatch(/\[data-state="complete"\] > \*\{visibility:hidden/)
  })

  it('lays content beside the line when vertical, and draws none in a row', () => {
    expect(css({ orientation: 'vertical' })).toMatch(/grid-column:2;grid-row:2/)
    expect(css({ orientation: 'horizontal' })).toMatch(/\{display:none\}/)
  })

  it('draws the states a step may state, and hides labels only when asked', () => {
    expect(css({})).toMatch(/\[data-state="loading"\]\{[^}]*border-style:dashed/)
    expect(css({})).toMatch(/\[data-state="error"\]\{[^}]*border-color:var\(--fk-error/)
    const unseen = (selection: Parameters<typeof Recipes.Steps>[0]) =>
      css(selection).match(/clip:rect/g)?.length ?? 0
    expect(unseen({ labels: 'hidden' })).toBeGreaterThan(unseen({}))
    expect(unseen({ labels: 'current' })).toBeGreaterThan(unseen({}))
  })
})
