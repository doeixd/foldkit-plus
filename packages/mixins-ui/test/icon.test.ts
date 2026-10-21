/**
 * Icon: one Container slot, a view that hides a decorative glyph and names
 * a meaningful one, and a recipe whose size sets the box.
 */
import { describe, expect, it } from 'vitest'
import { parse } from 'foldkit-media/icons'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { Inert } from 'foldkit-mixins/testing'
import { IconSlots, view } from '../src/icon.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()
const check = parse(
  '<svg viewBox="0 0 24 24"><linearGradient id="g"/><path fill="url(#g)" d="M20 6 9 17l-5-5"/></svg>',
  'check',
)
const gradientIds = (key?: string) =>
  Inert.byTag(
    view({ icon: check, ...(key === undefined ? {} : { key }) }, h),
    'linearGradient',
  ).map(node => Inert.value(node, 'id'))

describe('IconSlots', () => {
  it('publishes one container and nothing stateful', () => {
    expect(Object.keys(IconSlots)).toEqual(['glyph'])
    expect(IconSlots.glyph?.capability).toBe(Capability.Container)
  })
})

describe('Icon view', () => {
  it('draws the icon in its glyph', () => {
    expect(Inert.byTag(view({ icon: check }, h), 'path')).toHaveLength(1)
  })

  it('parts two copies of one icon by key, so their ids differ', () => {
    expect(gradientIds('a')).not.toEqual(gradientIds('b'))
    expect(gradientIds()).toEqual(gradientIds())
  })

  it('hides a decorative glyph and names a meaningful one', () => {
    const decorative = view({ icon: check }, h)
    expect(Inert.value(decorative, 'aria-hidden')).toBe('true')
    expect(Inert.value(decorative, 'role')).toBeUndefined()
    const named = view({ icon: check, label: 'Saved' }, h)
    expect(Inert.value(named, 'role')).toBe('img')
    expect(Inert.value(named, 'aria-label')).toBe('Saved')
    expect(Inert.value(named, 'aria-hidden')).toBeUndefined()
  })
})

describe('Icon recipe', () => {
  const css = (selection: Parameters<typeof Recipes.Icon>[0]): string =>
    Style.forSlots(IconSlots)(Recipes.Icon(selection)).css

  it('stands on the size ladder by default and takes the type scale when asked', () => {
    expect(css({})).toContain(`inline-size:${Theme.ladder('icon')}`)
    expect(css({ size: 'sm' })).toContain('inline-size:var(--fk-size-sm)')
  })
})
