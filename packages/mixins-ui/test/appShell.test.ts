/**
 * AppShell: a frame of Container slots and one link, with no state, that draws
 * only the regions it is given, marks whether it has a side column, and points
 * its skip link at the main region.
 */
import { describe, expect, it } from 'vitest'
import { A11y, Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { AppShellSlots, view } from '../src/appShell.js'
import { Patterns, Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()
const style = Style.forSlots(AppShellSlots)(Recipes.AppShell({}))

describe('AppShellSlots', () => {
  it('meets its pattern: a link and containers, nothing stateful', () => {
    expect(A11y.validate(Patterns.AppShell, AppShellSlots)).toEqual([])
    expect(
      Object.entries(AppShellSlots)
        .filter(([, slot]) => slot.capability !== Capability.Container)
        .map(([name]) => name),
    ).toEqual(['skip'])
  })
})

describe('AppShell view', () => {
  it('draws the banner, the main region the skip link reaches, and what it is given', () => {
    const page = view(
      {
        title: 'Journal',
        brand: h.span([], ['J']),
        status: [h.span([], ['Online'])],
        actions: [h.button([], ['Theme'])],
        side: h.nav([], ['Posts']),
        footer: [h.span([], ['MIT'])],
        mainId: 'content',
        words: { skip: 'Skip ahead' },
        style,
      },
      [h.h1([], ['Posts'])],
      h,
    )
    const [skip] = Inert.byTag(page, 'a')
    expect(Inert.value(skip!, 'href')).toBe('#content')
    expect(Inert.text(skip!)).toBe('Skip ahead')
    const [main] = Inert.byTag(page, 'main')
    expect(Inert.value(main!, 'id')).toBe('content')
    expect(Inert.value(main!, 'tabIndex')).toBe(-1)
    expect(Inert.text(main!)).toBe('Posts')
    expect(Inert.byTag(page, 'header')).toHaveLength(1)
    expect(Inert.byTag(page, 'footer')).toHaveLength(1)
    // The frame's regions, in order: the side column between the banner and the main region.
    expect(Inert.children(page).map(node => node.sel)).toEqual([
      'a',
      'header',
      'div',
      'main',
      'footer',
    ])
    const [brand, status, actions] = Inert.children(Inert.byTag(page, 'header')[0]!)
    // The mark is drawing; the title names the application.
    const [mark, title] = Inert.children(brand!)
    expect(Inert.value(mark!, 'aria-hidden')).toBe('true')
    expect(Inert.text(title!)).toBe('Journal')
    expect([Inert.text(status!), Inert.text(actions!)]).toEqual(['Online', 'Theme'])
    expect(Inert.text(Inert.byTag(page, 'footer')[0]!)).toBe('MIT')
    expect(Inert.value(page, 'data-side')).toBe('')
  })

  it('leaves out what it is not given, and has no side column without one', () => {
    // Empty lists draw nothing either, so no region is left standing empty.
    const page = view(
      { title: 'Notes', status: [], actions: [], footer: [], style },
      [h.p([], ['Hello'])],
      h,
    )
    expect(Inert.children(page).map(node => node.sel)).toEqual(['a', 'header', 'main'])
    const [header] = Inert.byTag(page, 'header')
    expect(Inert.children(header!)).toHaveLength(1)
    expect(Inert.children(Inert.children(header!)[0]!)).toHaveLength(1)
    expect(Inert.value(page, 'data-side')).toBeUndefined()
    expect(Inert.value(Inert.byTag(page, 'a')[0]!, 'href')).toBe('#main')
    expect(Inert.text(Inert.byTag(page, 'a')[0]!)).toBe('Skip to content')
  })
})
