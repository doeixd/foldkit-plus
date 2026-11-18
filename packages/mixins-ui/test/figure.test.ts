/**
 * Figure: a `figure` holding its content, then its caption in a
 * `figcaption`, both slots; no caption, no `figcaption`.
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { FigureSlots, configure, view } from '../src/figure.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()
const style = Style.forSlots(FigureSlots)(Recipes.Figure({}))
const content = h.img([h.Alt('A drum line'), h.Src('/drums.webp')])

describe('FigureSlots', () => {
  it('publishes a root and a caption, and nothing stateful', () => {
    expect(Object.keys(FigureSlots)).toEqual(['root', 'caption'])
    for (const slot of Object.values(FigureSlots))
      expect(slot.capability).toBe(Capability.Container)
  })
})

describe('Figure view', () => {
  it('draws its content, then its caption, in a figure', () => {
    const drawn = view({ content, caption: 'Finals, 2024', style }, h)
    expect(
      Inert.children(drawn).map(child => Inert.byTag(child, 'img').length > 0 || Inert.text(child)),
    ).toEqual([true, 'Finals, 2024'])
    const [caption] = Inert.byTag(drawn, 'figcaption')
    expect(Inert.text(caption)).toBe('Finals, 2024')
  })

  it('draws no figcaption without a caption', () => {
    expect(Inert.byTag(view({ content, style }, h), 'figcaption')).toHaveLength(0)
  })
})

describe('Figure caption side and configure', () => {
  const sheet = (selection: Parameters<typeof Recipes.Figure>[0]) =>
    Style.forSlots(FigureSlots)(Recipes.Figure(selection)).css

  it('puts the caption before the content with CSS alone, leaving the markup after it', () => {
    expect(sheet({ caption: 'before' })).toContain('order:-1')
    expect(sheet({})).not.toContain('order:-1')
    const drawn = view(
      {
        content,
        caption: 'Finals',
        style: Style.forSlots(FigureSlots)(Recipes.Figure({ caption: 'before' })),
      },
      h,
    )
    expect(Inert.children(drawn).map(child => child.sel)).toEqual(['img', 'figcaption'])
  })

  it('binds a style once, and the call wins', () => {
    const before = Style.forSlots(FigureSlots)(Recipes.Figure({ caption: 'before' }))
    const App = configure({ base: { style: before } })
    const classes = (drawn: ReturnType<typeof view>) =>
      Inert.classes(Inert.byTag(drawn, 'figcaption')[0])
    expect(classes(App.view({ content, caption: 'x' }, h))).toEqual(
      classes(view({ content, caption: 'x', style: before }, h)),
    )
    expect(classes(App.view({ content, caption: 'x', style }, h))).toEqual(
      classes(view({ content, caption: 'x', style }, h)),
    )
    expect(classes(view({ content, caption: 'x', style }, h))).not.toEqual(
      classes(view({ content, caption: 'x', style: before }, h)),
    )
  })
})
