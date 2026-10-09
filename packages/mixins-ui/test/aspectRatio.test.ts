/**
 * AspectRatio: one Container slot, a view that holds the content, and a
 * recipe whose ratio sets the frame.
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { AspectRatioSlots, view } from '../src/aspectRatio.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()

describe('AspectRatioSlots', () => {
  it('publishes one container and nothing stateful', () => {
    expect(Object.keys(AspectRatioSlots)).toEqual(['frame'])
    expect(AspectRatioSlots.frame?.capability).toBe(Capability.Container)
  })
})

describe('AspectRatio view', () => {
  it('holds the content it is given', () => {
    const frame = view({ content: h.img([h.Alt('A dune')]) }, h)
    expect(Inert.byTag(frame, 'img')).toHaveLength(1)
    expect(Inert.value(Inert.byTag(frame, 'img')[0], 'alt')).toBe('A dune')
  })
})

describe('AspectRatio recipe', () => {
  const css = (selection: Parameters<typeof Recipes.AspectRatio>[0]): string =>
    Style.forSlots(AspectRatioSlots)(Recipes.AspectRatio(selection)).css

  it('holds a square by default, a video frame when asked', () => {
    expect(css({})).toContain('aspect-ratio:1')
    expect(css({ ratio: 'video' })).toContain('aspect-ratio:16 / 9')
    expect(css({ ratio: 'portrait' })).toContain('aspect-ratio:3 / 4')
  })
})
