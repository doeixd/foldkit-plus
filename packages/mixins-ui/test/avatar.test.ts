/**
 * Avatar: three Container slots with no state behind them, a view stacking
 * the picture over derived initials, and a recipe sizing the disc.
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { AvatarSlots, view } from '../src/avatar.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()

describe('AvatarSlots', () => {
  it('publishes three containers and nothing stateful', () => {
    expect(Object.keys(AvatarSlots)).toEqual(['root', 'fallback', 'image'])
    for (const slot of Object.values(AvatarSlots)) {
      expect(slot.capability).toBe(Capability.Container)
    }
  })
})

describe('Avatar view', () => {
  it('stacks the picture over the initials with its name', () => {
    const face = view(
      {
        name: 'Ada Augusta King',
        src: 'https://example.com/ada.jpg',
        style: Style.forSlots(AvatarSlots)(Recipes.Avatar({})),
      },
      h,
    )
    expect(Inert.byTag(face, 'img')).toHaveLength(1)
    expect(Inert.value(Inert.byTag(face, 'img')[0], 'alt')).toBe('Ada Augusta King')
    expect(Inert.value(Inert.byTag(face, 'img')[0], 'src')).toBe('https://example.com/ada.jpg')
    expect(Inert.text(face)).toBe('AA')
  })
})

describe('Avatar recipe', () => {
  const css = (selection: Parameters<typeof Recipes.Avatar>[0]): string =>
    Style.forSlots(AvatarSlots)(Recipes.Avatar(selection)).css

  it('clips a covering picture into the disc', () => {
    const sheet = css({})
    expect(sheet).toContain('border-radius:var(--fk-radius-full)')
    expect(sheet).toContain('object-fit:cover')
  })

  it('sizes the disc per selection', () => {
    expect(css({})).toContain('2.5rem')
    expect(css({ size: 'lg' })).toContain('3.5rem')
  })
})
