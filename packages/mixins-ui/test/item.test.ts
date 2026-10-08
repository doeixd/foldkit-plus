/**
 * Item: six Container slots with no state behind them, a view that draws
 * only the regions the row earns, and a recipe whose density axis sizes the
 * row and its media.
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { ItemSlots, view } from '../src/item.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()

describe('ItemSlots', () => {
  it('publishes six containers and nothing stateful', () => {
    expect(Object.keys(ItemSlots)).toEqual([
      'root',
      'media',
      'content',
      'title',
      'description',
      'actions',
    ])
    for (const slot of Object.values(ItemSlots)) {
      expect(slot.capability).toBe(Capability.Container)
    }
  })
})

describe('Item view', () => {
  it('draws every earned region with its text', () => {
    const row = view(
      {
        media: h.span([], ['▣']),
        title: 'Report.pdf',
        description: '2 MB, yesterday',
        content: h.span([], ['picked']),
        actions: h.span([], ['⋯']),
        style: Style.forSlots(ItemSlots)(Recipes.Item({})),
      },
      h,
    )
    for (const text of ['Report.pdf', '2 MB, yesterday', 'picked', '⋯', '▣']) {
      expect(Inert.text(row)).toContain(text)
    }
  })

  it('skips regions the row does not earn', () => {
    const row = view({ content: h.span([], ['bare']) }, h)
    expect(Inert.text(row)).toBe('bare')
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
