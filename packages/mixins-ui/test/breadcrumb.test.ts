/**
 * Breadcrumb: Container slots with no state behind them and two to press,
 * a view that lands the trail in a navigation landmark with the current page
 * marked, folds a long trail's middle into an ellipsis, draws icons and a
 * separator of the application's own; and a recipe whose `separator` axis
 * picks the divider drawn between steps.
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { BreadcrumbSlots, collapsedOf, view } from '../src/breadcrumb.js'
import { Recipes } from '../src/index.js'
import { h as messaging, message } from './fixture.js'

const h = SlotView.inertBuilder<never>()

const steps = [
  { label: 'Docs', href: '/docs' },
  { label: 'Guides', href: '/docs/guides' },
  { label: 'Dialog', current: true },
]

const long = ['Home', 'Docs', 'Guides', 'Overlays', 'Dialog', 'Sizes'].map((label, index, all) =>
  index === all.length - 1 ? { label, current: true } : { label, href: `/${label}` },
)

describe('BreadcrumbSlots', () => {
  it('publishes containers and two slots to press, nothing stateful', () => {
    expect(Object.keys(BreadcrumbSlots)).toEqual([
      'root',
      'list',
      'item',
      'link',
      'current',
      'icon',
      'separator',
      'ellipsis',
    ])
    for (const name of ['root', 'list', 'item', 'current', 'icon', 'separator'] as const) {
      expect(BreadcrumbSlots[name]?.capability).toBe(Capability.Container)
    }
    expect(BreadcrumbSlots.link?.capability).toBe(Capability.Interactive)
    expect(BreadcrumbSlots.ellipsis?.capability).toBe(Capability.Interactive)
  })
})

describe('collapsedOf', () => {
  const labels = (part: ReadonlyArray<{ readonly label: string }>) => part.map(step => step.label)

  it('keeps the first step and the last max - 1, hiding the middle', () => {
    const { before, hidden, after } = collapsedOf(long, 3)
    expect(labels(before)).toEqual(['Home'])
    expect(labels(hidden)).toEqual(['Docs', 'Guides', 'Overlays'])
    expect(labels(after)).toEqual(['Dialog', 'Sizes'])
  })

  it('hides nothing in a trail that fits', () => {
    const { before, hidden, after } = collapsedOf(long, 6)
    expect(labels(before)).toEqual(labels(long))
    expect(hidden).toEqual([])
    expect(after).toEqual([])
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('folds nothing for a maximum of %s', max => {
    const { before, hidden, after } = collapsedOf(long, max)
    expect(labels(before)).toEqual(labels(long))
    expect(hidden).toEqual([])
    expect(after).toEqual([])
  })

  it('never keeps fewer than the first and the last', () => {
    const { before, after } = collapsedOf(long, 0)
    expect(labels(before)).toEqual(['Home'])
    expect(labels(after)).toEqual(['Sizes'])
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

  it('folds the middle of a long trail into an ellipsis that asks to expand', () => {
    const trail = view(
      { steps: long, collapse: { max: 3, onExpand: message('Clicked') } },
      messaging,
    )
    const items = Inert.byTag(trail, 'li')
    expect(items.map(item => Inert.text(item))).toEqual(['Home', '…', 'Dialog', 'Sizes'])
    const [ellipsis] = Inert.byTag(trail, 'button')
    expect(Inert.value(ellipsis, 'aria-label')).toBe('Show 3 more')
    expect(Inert.value(ellipsis, 'type')).toBe('button')
    expect(ellipsis?.data?.on?.['click']).toBeTypeOf('function')
  })

  it('draws no ellipsis when the trail fits', () => {
    const trail = view({ steps, collapse: { max: 3, onExpand: message('Clicked') } }, messaging)
    expect(Inert.byTag(trail, 'button')).toEqual([])
    expect(Inert.byTag(trail, 'li')).toHaveLength(3)
  })

  it('draws an icon before a label, hidden from assistive technology', () => {
    const trail = view({ steps: [{ label: 'Home', href: '/', icon: h.span([], ['⌂']) }] }, h)
    const [link] = Inert.byTag(trail, 'a')
    expect(Inert.text(link)).toBe('⌂Home')
    const [icon] = Inert.byTag(link, 'span')
    expect(Inert.value(icon, 'aria-hidden')).toBe('true')
  })

  it('draws its own separator in every step but the first, and says so on the list', () => {
    const trail = view({ steps, separator: h.span([], ['›']) }, h)
    const items = Inert.byTag(trail, 'li')
    expect(items.map(item => Inert.text(item))).toEqual(['Docs', '›Guides', '›Dialog'])
    expect(Inert.value(Inert.byTag(trail, 'ol')[0], 'data-separator')).toBe('custom')
    const plain = view({ steps }, h)
    expect(Inert.value(Inert.byTag(plain, 'ol')[0], 'data-separator')).toBeUndefined()
  })

  it('counts the ellipsis among the steps a custom separator follows', () => {
    const trail = view(
      {
        steps: long,
        separator: h.span([], ['›']),
        collapse: { max: 3, onExpand: message('Clicked') },
      },
      messaging,
    )
    expect(Inert.byTag(trail, 'li').map(item => Inert.text(item))).toEqual([
      'Home',
      '›…',
      '›Dialog',
      '›Sizes',
    ])
  })
})

describe('Breadcrumb recipe', () => {
  const css = (selection: Parameters<typeof Recipes.Breadcrumb>[0]): string =>
    Style.forSlots(BreadcrumbSlots)(Recipes.Breadcrumb(selection)).css

  it('rows muted steps with slashed dividers and an overt current page', () => {
    const sheet = css({})
    expect(sheet).toContain('list-style:none')
    expect(sheet).toContain('color:var(--fk-text-muted)')
    expect(sheet).toContain('font-weight:var(--fk-weight-medium)')
    expect(sheet).toContain('"/"')
  })

  it('draws a chevron, turned for right to left, or a dot in place of the slash', () => {
    const chevron = css({ separator: 'chevron' })
    expect(chevron).not.toContain('"/"')
    expect(chevron).toContain('rotate:-45deg')
    expect(chevron).toMatch(/:dir\(rtl\) > li \+ li::before\{[^}]*rotate:135deg/)
    const dot = css({ separator: 'dot' })
    expect(dot).not.toContain('"/"')
    expect(dot).toContain('background:currentColor')
  })

  it('takes the drawn divider away where the view draws its own', () => {
    expect(css({})).toMatch(/\[data-separator="custom"\] > li \+ li::before\{content:none/)
  })
})
