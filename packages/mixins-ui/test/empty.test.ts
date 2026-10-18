/**
 * Empty: five Container slots with no state behind them, a view that draws
 * only the regions the state earns with its picture hidden from a screen
 * reader, and a recipe that centres it.
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { EmptySlots, view } from '../src/empty.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()

describe('EmptySlots', () => {
  it('publishes five containers and nothing stateful', () => {
    expect(Object.keys(EmptySlots)).toEqual(['root', 'icon', 'title', 'description', 'action'])
    for (const slot of Object.values(EmptySlots)) {
      expect(slot.capability).toBe(Capability.Container)
    }
  })
})

describe('Empty view', () => {
  it('draws the title with what it earns, nothing more', () => {
    const full = view(
      {
        title: 'No projects yet',
        description: 'Create one to get going.',
        icon: h.span([], ['∅']),
        action: h.span([], ['New project']),
        style: Style.forSlots(EmptySlots)(Recipes.Empty({})),
      },
      h,
    )
    for (const text of ['No projects yet', 'Create one to get going.', '∅', 'New project']) {
      expect(Inert.text(full)).toContain(text)
    }
    const bare = view({ title: 'Nothing here' }, h)
    expect(Inert.text(bare)).toBe('Nothing here')
  })

  it('hides its picture, which the title says in words', () => {
    const drawn = view({ title: 'No results', icon: h.span([], ['⌕']) }, h)
    expect(Inert.value(Inert.children(drawn)[0], 'aria-hidden')).toBe('true')
  })
})

describe('Empty recipe', () => {
  it('centers muted content with a title in the heading weight', () => {
    const sheet = Style.forSlots(EmptySlots)(Recipes.Empty({})).css
    expect(sheet).toContain('justify-items:center')
    expect(sheet).toContain('text-align:center')
    expect(sheet).toContain('font-weight:var(--fk-weight-heading)')
  })
})
