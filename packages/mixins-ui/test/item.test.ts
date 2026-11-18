/**
 * Item, the row primitive: a view that draws only the regions the row
 * earns, one control stretched over a pressable row and named by its title,
 * the state it carries for a style, a list of keyed rows, and a recipe whose
 * axes size and frame it.
 */
import { describe, expect, it } from 'vitest'
import { Capability, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import {
  ItemGroupSlots,
  ItemSlots,
  configure,
  group,
  view as drawItem,
  type ItemView,
} from '../src/item.js'
import { Recipes } from '../src/index.js'
import { h, message, type TestMessage } from './fixture.js'

// Slots are found by the mark a style writes, so every row is drawn styled, as an app draws it.
const style = Style.forSlots(ItemSlots)(Recipes.Item({}))
const view = (options: ItemView<TestMessage>) => drawItem({ style, ...options }, h)
const overlayOf = (row: ReturnType<typeof view>) =>
  Inert.all(row).find(node => Inert.value(node, 'data-fluid-press') !== undefined)

describe('ItemSlots', () => {
  it('publishes its regions as containers, and the overlay as a control', () => {
    const interactive = Object.entries(ItemSlots)
      .filter(([, slot]) => slot.capability !== Capability.Container)
      .map(([name]) => name)
    expect(interactive).toEqual(['overlay'])
  })
})

describe('Item view', () => {
  it('draws every earned region with its text', () => {
    const row = view({
      media: h.span([], ['▣']),
      title: 'Report.pdf',
      description: '2 MB, yesterday',
      content: h.span([], ['picked']),
      actions: h.span([], ['⋯']),
    })
    for (const text of ['Report.pdf', '2 MB, yesterday', 'picked', '⋯', '▣']) {
      expect(Inert.text(row)).toContain(text)
    }
  })

  it('skips regions the row does not earn', () => {
    expect(Inert.text(view({ content: h.span([], ['bare']) }))).toBe('bare')
    expect(overlayOf(view({ title: 'Still' }))).toBeUndefined()
  })

  it('stretches one button over a pressable row, named by its title', () => {
    const row = view({ title: 'Wi-Fi', press: { onClick: message('Clicked') }, selected: true })
    const control = overlayOf(row)
    expect(Inert.byTag(row, 'button')).toEqual([control])
    expect(Inert.value(control, 'aria-label')).toBe('Wi-Fi')
    expect(Inert.value(control, 'aria-pressed')).toBe('true')
    expect(Inert.value(row, 'data-pressable')).toBe('true')
    expect(Inert.value(row, 'data-selected')).toBe('true')
  })

  it('stretches a link over a row that goes somewhere, and a disabled one goes nowhere', () => {
    const control = overlayOf(view({ title: 'Billing', press: { href: '/billing' } }))
    expect(Inert.value(control, 'href')).toBe('/billing')
    const off = overlayOf(view({ title: 'Billing', press: { href: '/billing' }, disabled: true }))
    expect(Inert.value(off, 'href')).toBeUndefined()
    expect(Inert.value(off, 'aria-disabled')).toBe('true')
  })

  it('names the control by its label over the title, and refuses a pressable row with neither', () => {
    const control = overlayOf(
      view({ title: 'Ada', label: 'Open Ada’s profile', press: { href: '/ada' } }),
    )
    expect(Inert.value(control, 'aria-label')).toBe('Open Ada’s profile')
    expect(() => view({ press: { href: '/x' } })).toThrow(/needs a `label`/)
  })
})

describe('Item group', () => {
  it('is a named list of keyed rows, each drawn with the row style', () => {
    const list = group(
      {
        label: 'Notifications',
        items: ['a', 'b'].map(key => ({ key, title: `Row ${key}` })),
        style: Style.forSlots(ItemGroupSlots)(Recipes.ItemGroup({})),
        itemStyle: style,
      },
      h,
    )
    expect(Inert.value(list, 'role')).toBe('list')
    expect(Inert.value(list, 'aria-label')).toBe('Notifications')
    const rows = Inert.children(list)
    expect(rows.map(row => (typeof row === 'string' ? row : row.key))).toEqual(['a', 'b'])
    expect(Inert.text(rows[1]!)).toBe('Row b')
  })
})

describe('Item recipe', () => {
  const css = (selection: Parameters<typeof Recipes.Item>[0]): string =>
    Style.forSlots(ItemSlots)(Recipes.Item(selection)).css

  it('truncates the semibold title and pushes actions to the end', () => {
    const sheet = css({})
    expect(sheet).toContain('text-overflow:ellipsis')
    expect(sheet).toContain('font-weight:var(--fk-weight-semibold)')
    expect(sheet).toContain('margin-inline-start:auto')
  })

  it('sizes the row and its media per density', () => {
    expect(css({})).toContain('2.5rem')
    expect(css({ density: 'compact' })).toContain('1.75rem')
  })
})

describe('Item header and footer', () => {
  it('draws a band before the media and one after the actions, each its own region', () => {
    const row = view({
      header: h.span([], ['Header text']),
      media: h.span([], ['M']),
      title: 'Title',
      actions: h.span([], ['A']),
      footer: h.span([], ['Footer text']),
    })
    const order = Inert.children(row).map(child => Inert.text(child))
    expect(order).toEqual(['Header text', 'M', 'Title', 'A', 'Footer text'])
  })

  it('draws neither without them', () => {
    expect(Inert.children(view({ title: 'T' })).map(child => Inert.text(child))).toEqual(['T'])
  })
})

describe('Item words and wrap', () => {
  it('says what a new-tab link is called', () => {
    const row = view({
      title: 'Docs',
      press: { href: 'https://example.com', external: true },
      words: { newTab: 'Neuer Tab' },
    })
    expect(Inert.value(overlayOf(row), 'aria-description')).toBe('Neuer Tab')
  })

  it('draws around each row inside its list item', () => {
    const drawn = group(
      {
        items: [{ key: 'a', title: 'A' }],
        wrap: (row, source) => h.a([h.Href(`/${source.key}`)], [row]),
      },
      h,
    )
    expect(Inert.value(Inert.children(Inert.children(drawn)[0])[0], 'href')).toBe('/a')
  })
})

describe('Item.configure', () => {
  const App = configure({ base: { style }, presets: { de: { words: { newTab: 'Neuer Tab' } } } })

  it('binds the style and a preset’s words', () => {
    const link = { href: 'https://example.com', external: true }
    expect(Inert.classes(App.view({ title: 'T' }, h))).toEqual(Inert.classes(view({ title: 'T' })))
    const row = App.view({ title: 'T', press: link, preset: 'de' }, h)
    expect(Inert.value(overlayOf(row), 'aria-description')).toBe('Neuer Tab')
  })

  it('gives a group its rows’ style', () => {
    const items = [{ key: 'a', title: 'A' }]
    const rowOf = (drawn: ReturnType<typeof group>) => Inert.children(Inert.children(drawn)[0])[0]
    expect(Inert.classes(rowOf(App.group({ items }, h)))).toEqual(
      Inert.classes(view({ title: 'A' })),
    )
    expect(Inert.classes(rowOf(group({ items }, h)))).not.toEqual(
      Inert.classes(view({ title: 'A' })),
    )
  })
})
