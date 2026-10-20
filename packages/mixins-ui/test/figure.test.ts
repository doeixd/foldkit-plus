/**
 * Figure: a `figure` holding its content, then its caption in a
 * `figcaption`, both slots; no caption, no `figcaption`.
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { FigureSlots, view } from '../src/figure.js'
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
