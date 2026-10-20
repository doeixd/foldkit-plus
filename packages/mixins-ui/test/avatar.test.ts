/**
 * Avatar: one image named by the person, the picture stacked over initials,
 * a status dot that says the status aloud, a hue that follows the name, and
 * a group that draws at most `max` and counts the rest as one more avatar.
 */
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { ImageAsset, Provider } from 'foldkit-media'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { AvatarGroupSlots, AvatarSlots, group, view } from '../src/avatar.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()
const style = Style.forSlots(AvatarSlots)(Recipes.Avatar({}))
const groupStyle = Style.forSlots(AvatarGroupSlots)(Recipes.AvatarGroup({}))
const hueOf = (drawn: ReturnType<typeof view>) => Inert.style(drawn)['--fk-avatar-hue']

describe('AvatarSlots', () => {
  it('publishes four containers and nothing stateful', () => {
    expect(Object.keys(AvatarSlots)).toEqual(['root', 'fallback', 'image', 'status'])
    for (const slot of Object.values(AvatarSlots)) {
      expect(slot.capability).toBe(Capability.Container)
    }
  })
})

describe('Avatar view', () => {
  it('is one image named by the person, the picture over hidden initials', () => {
    const face = view({ name: 'Ada Augusta King', src: 'https://example.com/ada.jpg', style }, h)
    expect(Inert.value(face, 'role')).toBe('img')
    expect(Inert.value(face, 'aria-label')).toBe('Ada Augusta King')
    const [image] = Inert.byTag(face, 'img')
    expect(Inert.value(image, 'src')).toBe('https://example.com/ada.jpg')
    // Unnamed, so a picture that fails shows the initials rather than its alt text.
    expect(Inert.value(image, 'alt')).toBe('')
    expect(Inert.text(face)).toBe('AA')
    const fallback = Inert.children(face)[0]
    expect(Inert.value(fallback, 'aria-hidden')).toBe('true')
  })

  it('draws initials alone without a picture, or the ones it is given', () => {
    expect(Inert.byTag(view({ name: 'Grace Hopper', style }, h), 'img')).toHaveLength(0)
    expect(Inert.text(view({ name: 'Grace Hopper', initials: 'G', style }, h))).toBe('G')
  })

  it('says the status in the name and marks the dot with it', () => {
    const face = view({ name: 'Alan Turing', status: 'away', style }, h)
    expect(Inert.value(face, 'aria-label')).toBe('Alan Turing, Away')
    const dot = Inert.all(face).find(node => Inert.value(node, 'data-status') !== undefined)
    expect(Inert.value(dot, 'data-status')).toBe('away')
    const spoken = view({ name: 'Alan Turing', status: 'busy', statusLabel: 'Occupé', style }, h)
    expect(Inert.value(spoken, 'aria-label')).toBe('Alan Turing, Occupé')
  })

  it('gives a name one hue, and different names different ones', () => {
    const hues = ['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Ada Lovelace'].map(name =>
      hueOf(view({ name, style }, h)),
    )
    expect(hues[0]).toBe(hues[3])
    expect(new Set(hues).size).toBe(3)
    for (const hue of hues) expect(Number(hue)).toBeLessThan(360)
  })
})

describe('Avatar group', () => {
  const people = [
    'Ada Lovelace',
    'Grace Hopper',
    'Alan Turing',
    'Edsger Dijkstra',
    'Barbara Liskov',
  ]
  const drawn = (max?: number) =>
    group(
      {
        people: people.map(name => ({ name })),
        max,
        label: 'Editors',
        style: groupStyle,
        avatarStyle: style,
      },
      h,
    )

  it('draws at most `max`, then one more avatar that counts the rest', () => {
    const avatars = Inert.children(drawn(3))
    expect(avatars.map(avatar => Inert.value(avatar, 'aria-label'))).toEqual([
      'Ada Lovelace',
      'Grace Hopper',
      'Alan Turing',
      '2 more',
    ])
    expect(Inert.text(avatars[3]!)).toBe('+2')
    expect(Inert.value(avatars[3], 'data-rest')).toBe('2')
    expect(Inert.value(avatars[0], 'data-rest')).toBeUndefined()
  })

  it('draws everyone with no `max`, and no count', () => {
    expect(Inert.children(drawn())).toHaveLength(5)
    expect(Inert.text(drawn())).not.toContain('+')
  })

  it('is a named group', () => {
    expect(Inert.value(drawn(), 'role')).toBe('group')
    expect(Inert.value(drawn(), 'aria-label')).toBe('Editors')
  })

  it('refuses a max below one', () => {
    expect(() => drawn(0)).toThrow(/max must be a whole number/)
  })
})

describe('Avatar recipe', () => {
  const css = (selection: Parameters<typeof Recipes.Avatar>[0]): string =>
    Style.forSlots(AvatarSlots)(Recipes.Avatar(selection)).css

  it('covers the disc with the picture', () => {
    expect(css({})).toContain('border-radius:calc(50% * min(var(--fk-knob-radius-factor), 1))')
    expect(css({})).toContain('object-fit:cover')
  })

  it('sizes the disc per selection', () => {
    expect(css({})).toContain('2.5rem')
    expect(css({ size: 'lg' })).toContain('3.5rem')
    expect(css({ size: 'xl' })).toContain('5rem')
  })
})

describe('Avatar with a derived picture', () => {
  const asset = Schema.decodeUnknownSync(ImageAsset)({
    key: 'ada.jpg',
    width: 512,
    height: 512,
    alpha: false,
    hash: null,
    placeholder: null,
  })
  const provider = Provider.fromFiles(
    [32, 64, 128, 512].map(width => ({
      width,
      format: 'webp' as const,
      url: `/ada-${width}.webp`,
    })),
    { sources: [], fallback: 'webp' },
  )

  it('fetches the widths that cover its 1x and 2x, lazily, still unnamed', () => {
    const face = view({ name: 'Ada Lovelace', src: { asset, provider, width: 32 }, style }, h)
    const [image] = Inert.byTag(face, 'img')
    expect(
      ['srcset', 'sizes', 'src', 'loading', 'alt'].map(name => Inert.value(image, name)),
    ).toEqual(['/ada-32.webp 32w, /ada-64.webp 64w', 'auto, 32px', '/ada-32.webp', 'lazy', ''])
  })

  it('stands on its initials when the provider has no URL for the picture', () => {
    const none = Provider.fromFiles([{ width: 32, format: 'avif', url: '/ada.avif' }], {
      sources: [],
      fallback: 'webp',
    })
    const face = view({ name: 'Ada Lovelace', src: { asset, provider: none, width: 32 }, style }, h)
    expect(Inert.byTag(face, 'img')).toHaveLength(0)
    expect(Inert.text(face)).toBe('AL')
  })
})
