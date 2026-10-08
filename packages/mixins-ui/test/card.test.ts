/**
 * Card: seven Container slots with no state behind them, a view that draws
 * only the regions the card earns, and a recipe whose padding axis selects
 * per slot through the shared scales.
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Card, CardSlots, view } from '../src/card.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()

describe('CardSlots', () => {
  it('publishes seven containers and nothing stateful', () => {
    expect(Object.keys(CardSlots)).toEqual([
      'root',
      'header',
      'title',
      'description',
      'content',
      'footer',
      'action',
    ])
    for (const name of Object.keys(CardSlots)) {
      expect(CardSlots[name]?.capability).toBe(Capability.Container)
    }
  })
})

describe('Card view', () => {
  it('draws every earned region with its text', () => {
    const card = view(
      {
        title: 'Usage',
        description: 'This month',
        content: '42 runs',
        footer: 'Updated just now',
        action: 'View',
        style: Style.forSlots(CardSlots)(Recipes.Card({})),
      },
      h,
    )
    expect(Inert.text(card)).toContain('Usage')
    expect(Inert.text(card)).toContain('This month')
    expect(Inert.text(card)).toContain('42 runs')
    expect(Inert.text(card)).toContain('Updated just now')
    expect(Inert.text(card)).toContain('View')
    expect(Inert.byTag(card, 'h3')).toHaveLength(1)
  })

  it('skips regions the card does not earn', () => {
    const card = view({ content: 'bare' }, h)
    expect(Inert.text(card)).toBe('bare')
    expect(Inert.byTag(card, 'h3')).toHaveLength(0)
    expect(Inert.byTag(card, 'p')).toHaveLength(0)
  })
})

describe('Card recipe', () => {
  const css = (selection: Parameters<typeof Recipes.Card>[0]): string =>
    Style.forSlots(CardSlots)(Recipes.Card(selection)).css

  it('draws the base surface once, in the components layer', () => {
    expect(css({})).toMatch(/@layer components\{[^@]*background:var\(--fk-surface-base\)/)
  })

  it('pads per selection, flush for media', () => {
    expect(css({})).toContain('padding:var(--fk-space-md)')
    expect(css({ padding: 'flush' })).toContain('padding:0')
    expect(css({ padding: 'roomy' })).toContain('padding:var(--fk-space-lg)')
  })
})
