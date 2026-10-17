/**
 * Thinking Indicator: a polite status drawn always, empty while idle; the
 * mark hidden from assistive technology and the words carrying the status;
 * and a recipe whose movements take a travel's time and hold still under
 * reduced motion.
 */
import { describe, expect, it } from 'vitest'
import { A11y, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { ThinkingIndicatorSlots, view } from '../src/thinkingIndicator.js'
import { ThinkingIndicator } from '../src/recipes/thinkingIndicator.js'
import { Patterns } from '../src/index.js'

const h = SlotView.inertBuilder<never>()
const style = Style.forSlots(ThinkingIndicatorSlots)(ThinkingIndicator({}))

const Drawn = SlotView.forMessages<never>().define(
  ThinkingIndicatorSlots,
  (detail: string | undefined, _, h) => view({ detail, style }, h),
)

describe('ThinkingIndicator view', () => {
  it('is a status whose words say what it is doing', () => {
    const drawn = view({ detail: 'Searching the web' }, h)
    expect(Inert.value(drawn, 'role')).toBe('status')
    expect(Inert.text(drawn)).toBe('ThinkingSearching the web')
    const [mark] = Inert.children(drawn)
    expect(Inert.value(mark, 'aria-hidden')).toBe('true')
    expect(Inert.children(mark)).toHaveLength(3)
  })

  it('takes its own words', () => {
    expect(Inert.text(view({ label: 'Reading 4 sources' }, h))).toBe('Reading 4 sources')
  })

  it('idle, is the region alone, empty, so it is there before it speaks', () => {
    const drawn = view({ active: false, detail: 'Searching' }, h)
    expect(Inert.value(drawn, 'role')).toBe('status')
    expect(Inert.children(drawn)).toHaveLength(0)
  })

  it('draws the view’s icon in place of the dots', () => {
    const drawn = view({ icon: h.span([h.Id('spark')], []) }, h)
    const [mark] = Inert.children(drawn)
    expect(Inert.children(mark)).toHaveLength(1)
    expect(Inert.all(mark).some(node => Inert.value(node, 'id') === 'spark')).toBe(true)
  })

  it('draws every element in a Slot', () => {
    expect(Inert.unslotted(Inert.draw(Drawn, 'Searching'))).toEqual([])
  })

  it('meets its pattern: a status the words fill', () => {
    expect(A11y.validate(Patterns.ThinkingIndicator, ThinkingIndicatorSlots)).toEqual([])
  })
})

describe('ThinkingIndicator recipe', () => {
  const css = (selection: Parameters<typeof ThinkingIndicator>[0]): string =>
    Style.stylesheet(Style.forSlots(ThinkingIndicatorSlots)(ThinkingIndicator(selection)))

  it('sweeps the words and raises the dots for a travel’s time', () => {
    const sheet = css({})
    expect(sheet).toContain('background-clip:text')
    expect(sheet.match(/var\(--fk-knob-travel\)/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it.each([
    ['the dots', { mark: 'dots' }],
    ['the pulse', { mark: 'pulse' }],
    ['the sweep', { mark: 'none', label: 'shimmer' }],
  ] as const)('holds %s still under reduced motion', (_, selection) => {
    expect(css(selection)).toMatch(/prefers-reduced-motion: reduce\)\{[^}]*\{animation:none/)
  })

  it('sweeps the other way right to left', () => {
    expect(css({})).toMatch(/:dir\(rtl\)\{animation-direction:reverse/)
  })
})
