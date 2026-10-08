/**
 * ScrollArea: one Container slot, a view drawing its content in a focusable
 * box, and a recipe owning the axes, the containment, and the thin bars.
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { ScrollAreaSlots, view } from '../src/scrollArea.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()

describe('ScrollAreaSlots', () => {
  it('publishes one container and nothing stateful', () => {
    expect(Object.keys(ScrollAreaSlots)).toEqual(['viewport'])
    expect(ScrollAreaSlots.viewport?.capability).toBe(Capability.Container)
  })
})

describe('ScrollArea view', () => {
  it('draws its content in a keyboard-reachable box', () => {
    const area = view(
      {
        content: h.p([], ['Long words']),
        style: Style.forSlots(ScrollAreaSlots)(Recipes.ScrollArea({})),
      },
      h,
    )
    expect(Inert.byTag(area, 'div')).toHaveLength(1)
    expect(Inert.value(Inert.byTag(area, 'div')[0], 'tabIndex')).toBe(0)
    expect(Inert.text(area)).toBe('Long words')
  })
})

describe('ScrollArea recipe', () => {
  const css = (selection: Parameters<typeof Recipes.ScrollArea>[0]): string =>
    Style.forSlots(ScrollAreaSlots)(Recipes.ScrollArea(selection)).css

  it('contains chained scrolling behind thin bars', () => {
    const sheet = css({})
    expect(sheet).toContain('overscroll-behavior:contain')
    expect(sheet).toContain('scrollbar-width:thin')
  })

  it('scrolls one axis at a time unless asked for both', () => {
    expect(css({})).toContain('overflow-block:auto')
    expect(css({})).toContain('overflow-inline:hidden')
    expect(css({ orientation: 'horizontal' })).toContain('overflow-inline:auto')
    expect(css({ orientation: 'both' })).toContain('overflow:auto')
  })
})
