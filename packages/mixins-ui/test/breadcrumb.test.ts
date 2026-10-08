/**
 * Breadcrumb: five Container slots with no state behind them, a view that
 * lands the trail in a navigation landmark with the current page marked,
 * and a variant-free recipe (one trail look; the look is chosen once).
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { BreadcrumbSlots, view } from '../src/breadcrumb.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()

const steps = [
  { label: 'Docs', href: '/docs' },
  { label: 'Guides', href: '/docs/guides' },
  { label: 'Dialog', current: true },
]

describe('BreadcrumbSlots', () => {
  it('publishes containers and one interactive link, nothing stateful', () => {
    expect(Object.keys(BreadcrumbSlots)).toEqual(['root', 'list', 'item', 'link', 'current'])
    for (const name of ['root', 'list', 'item', 'current'] as const) {
      expect(BreadcrumbSlots[name]?.capability).toBe(Capability.Container)
    }
    expect(BreadcrumbSlots.link?.capability).toBe(Capability.Interactive)
  })
})

describe('Breadcrumb view', () => {
  it('lands in a nav landmark with the current page marked', () => {
    const trail = view({ steps, style: Style.forSlots(BreadcrumbSlots)(Recipes.Breadcrumb({})) }, h)
    expect(Inert.byRole(trail, 'navigation')).toHaveLength(1)
    expect(Inert.byTag(trail, 'ol')).toHaveLength(1)
    expect(Inert.byTag(trail, 'li')).toHaveLength(3)
    const current = Inert.byLabel(trail, 'Dialog')[0]
    expect(Inert.value(current, 'aria-current')).toBe('page')
    expect(Inert.byTag(trail, 'a')).toHaveLength(2)
  })
})

describe('Breadcrumb recipe', () => {
  it('rows muted steps with slashed dividers and an overt current page', () => {
    const sheet = Style.forSlots(BreadcrumbSlots)(Recipes.Breadcrumb({})).css
    expect(sheet).toContain('list-style:none')
    expect(sheet).toContain('color:var(--fk-text-muted)')
    expect(sheet).toContain('font-weight:var(--fk-weight-medium)')
    expect(sheet).toContain('"/"')
  })
})
