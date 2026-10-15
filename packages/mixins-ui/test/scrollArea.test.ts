/**
 * ScrollArea: a `viewport` that scrolls in a `root`, which with
 * `overlayBars` holds a bar per axis for `ScrollBars`; a view drawing its
 * content in a focusable box, and a recipe owning the axes, the
 * containment, the bars and the edge lines.
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { ScrollAreaSlots, view } from '../src/scrollArea.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()

const draw = (overlayBars?: boolean) =>
  view(
    {
      content: h.p([], ['Long words']),
      ...(overlayBars === undefined ? {} : { overlayBars }),
      style: Style.forSlots(ScrollAreaSlots)(Recipes.ScrollArea({})),
    },
    h,
  )

describe('ScrollAreaSlots', () => {
  it('publishes containers and nothing stateful', () => {
    expect(Object.keys(ScrollAreaSlots)).toEqual(['root', 'viewport', 'bar', 'thumb'])
    for (const slot of Object.values(ScrollAreaSlots)) {
      expect(slot.capability).toBe(Capability.Container)
    }
  })
})

describe('ScrollArea view', () => {
  it('draws its content in a keyboard-reachable box, in the root', () => {
    const area = draw()
    const [root, viewport, ...rest] = Inert.byTag(area, 'div')
    expect(rest).toEqual([])
    expect(Inert.children(root)).toEqual([viewport])
    expect(Inert.value(viewport, 'tabIndex')).toBe(0)
    expect(Inert.text(area)).toBe('Long words')
    // No Mount, so a Scene test of a page with a ScrollArea resolves nothing for it.
    expect(viewport?.data?.foldkitMount).toBeUndefined()
  })

  it('draws a hidden bar per axis, each with a thumb, and runs the bars on the viewport', () => {
    const area = draw(true)
    const [root, viewport] = Inert.byTag(area, 'div')
    const bars = Inert.children(root).slice(1)
    expect(bars.map(bar => Inert.value(bar, 'data-scroll-bar'))).toEqual(['block', 'inline'])
    for (const bar of bars) {
      expect(Inert.value(bar, 'aria-hidden')).toBe('true')
      expect(Inert.children(bar)).toHaveLength(1)
    }
    expect(viewport?.data?.foldkitMount).toEqual({ name: 'ScrollBars', args: {} })
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

  it('hides the browser bar only while the overlay runs', () => {
    expect(css({})).toMatch(/\[data-scroll-overlaid\]\{scrollbar-width:none\}/)
  })

  it('draws a bar only while its axis scrolls, and fades it in and out', () => {
    const sheet = css({})
    expect(sheet).toMatch(/\[data-scrollable\]\{display:block\}/)
    expect(sheet).toMatch(/\[data-shown\]\{opacity:1;/)
  })

  it('widens the thumb under the pointer, by a duration reduced motion stills', () => {
    const sheet = css({})
    expect(sheet).toContain(':is(:hover, [data-dragging])')
    expect(sheet).toContain('inline-size:6px')
    expect(sheet).toContain('var(--fk-knob-travel)')
  })

  it('lines the edges of the scrolling axis', () => {
    expect(css({})).toContain('timeline-scope:--_fk-scroller-block')
    expect(css({})).toContain('scroll-timeline:--_fk-scroller-block block')
    expect(css({ orientation: 'horizontal' })).toContain('timeline-scope:--_fk-scroller-inline')
  })
})
