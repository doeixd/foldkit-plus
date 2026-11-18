/**
 * Breadcrumb: Container slots with no state behind them and two to press,
 * a view that lands the trail in a navigation landmark with the current page
 * marked, folds a long trail's middle into an ellipsis, draws icons and a
 * separator of the application's own; and a recipe whose `separator` axis
 * picks the divider drawn between steps.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import {
  BreadcrumbSlots,
  chosen,
  collapsedOf,
  menuRows,
  view,
  type CollapseFeature,
} from '../src/breadcrumb.js'
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
      'trailing',
      'separator',
      'ellipsis',
      'dots',
    ])
    for (const name of [
      'root',
      'list',
      'item',
      'current',
      'icon',
      'trailing',
      'separator',
      'dots',
    ] as const) {
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

describe('the Menu of the hidden steps', () => {
  it('has a row for each hidden step, in order', () => {
    expect(menuRows(long, 3)).toEqual([
      { value: '0', label: 'Docs' },
      { value: '1', label: 'Guides' },
      { value: '2', label: 'Overlays' },
    ])
    expect(menuRows(long, 6)).toEqual([])
  })

  it('finds the hidden step a chosen row stands for, and none outside the fold', () => {
    expect(chosen(long, 3, '1')).toEqual(Option.some({ label: 'Guides', href: '/Guides' }))
    expect(chosen(long, 3, '3')).toEqual(Option.none())
    expect(chosen(long, 3, 'Nowhere')).toEqual(Option.none())
  })

  it('tells two hidden steps of one label apart', () => {
    const twins = [
      { label: 'Home', href: '/' },
      { label: 'Guides', href: '/a/guides' },
      { label: 'Guides', href: '/b/guides' },
      { label: 'Dialog', href: '/dialog' },
      { label: 'Sizes', current: true },
    ]
    const values = menuRows(twins, 3).map(row => row.value)
    expect(new Set(values).size).toBe(2)
    expect(Option.map(chosen(twins, 3, values[1] ?? ''), step => step.href)).toEqual(
      Option.some('/b/guides'),
    )
  })
})

describe('Breadcrumb view', () => {
  it('names its landmark Breadcrumb, or what it is given', () => {
    const name = (label?: string) =>
      Inert.value(
        Inert.byTag(view({ steps, words: label === undefined ? {} : { label } }, h), 'nav')[0],
        'aria-label',
      )
    expect(name()).toBe('Breadcrumb')
    expect(name('Fil d’Ariane')).toBe('Fil d’Ariane')
  })

  it('words the ellipsis: its name fills the count of hidden steps, and its mark is text', () => {
    const trail = view(
      {
        steps: long,
        words: { more: '{count} de plus', ellipsis: '...' },
        collapse: { max: 3, onExpand: message('Clicked') },
      },
      messaging,
    )
    const [ellipsis] = Inert.byTag(trail, 'button')
    expect(Inert.value(ellipsis, 'aria-label')).toBe('3 de plus')
    expect(Inert.text(ellipsis)).toBe('...')
  })

  it('hands the ellipsis to a collapse feature written outside the package', () => {
    const feature: CollapseFeature<never> = {
      max: 3,
      draw: ({ label, ellipsis, hidden }, builder) =>
        builder.span([], [`${ellipsis}${hidden.length}:${label}`]),
    }
    const trail = view({ steps: long, collapse: feature }, h)
    expect(Inert.byTag(trail, 'li').map(item => Inert.text(item))).toEqual([
      'Home',
      '…3:Show 3 more',
      'Dialog',
      'Sizes',
    ])
  })

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

  it('draws its own separator after every step but the last, and says so on the list', () => {
    const trail = view({ steps, separator: h.span([], ['›']) }, h)
    const items = Inert.byTag(trail, 'li')
    expect(items.map(item => Inert.text(item))).toEqual(['Docs›', 'Guides›', 'Dialog'])
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
      'Home›',
      '…›',
      'Dialog›',
      'Sizes',
    ])
  })
})

describe('a step beyond its words', () => {
  it('draws trailing content after the label, in its own slot', () => {
    const trail = view({ steps: [{ label: 'Inbox', href: '/', trailing: h.span([], ['12']) }] }, h)
    expect(Inert.text(Inert.byTag(trail, 'a')[0])).toBe('Inbox12')
  })

  it('names an icon-only step by its label, and draws no words', () => {
    const trail = view(
      {
        steps: [
          { label: 'Home', href: '/', icon: h.span([], ['⌂']), labelHidden: true },
          { label: 'Here', current: true, labelHidden: true, icon: h.span([], ['★']) },
          { label: 'Docs', href: '/docs' },
        ],
      },
      h,
    )
    const [home, docs] = Inert.byTag(trail, 'a')
    expect(Inert.text(home)).toBe('⌂')
    expect(Inert.value(home, 'aria-label')).toBe('Home')
    expect(Inert.value(docs, 'aria-label')).toBeUndefined()
    const here = Inert.byLabel(trail, 'Here')[0]
    expect(Inert.value(here, 'aria-current')).toBe('page')
    expect(Inert.text(here)).toBe('★')
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

  it('gives pills and buttons their own box, and plain steps none', () => {
    expect(css({})).not.toContain('border-radius:var(--fk-radius-full)')
    expect(css({ item: 'pill' })).toContain('border-radius:var(--fk-radius-full)')
    const button = css({ item: 'button' })
    expect(button).toContain('border-radius:var(--fk-radius-md)')
    expect(button).toMatch(/border:var\(--fk-border-thin\) solid/)
  })

  it('draws the ellipsis plain, even as a link a fold of your own draws', () => {
    // The link's own rule and the ellipsis's.
    expect(css({}).split('text-decoration:none')).toHaveLength(3)
  })

  it('draws a chevron, turned for right to left, or a dot in place of the slash', () => {
    const chevron = css({ separator: 'chevron' })
    expect(chevron).not.toContain('"/"')
    expect(chevron).toContain('rotate:-45deg')
    expect(chevron).toMatch(/:dir\(rtl\) > li:not\(:last-child\)::after\{[^}]*rotate:135deg/)
    const dot = css({ separator: 'dot' })
    expect(dot).not.toContain('"/"')
    expect(dot).toContain('background:currentColor')
  })

  it('takes the drawn divider away where the view draws its own', () => {
    expect(css({})).toMatch(
      /\[data-separator="custom"\] > li:not\(:last-child\)::after\{content:none/,
    )
  })
})
