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
  it('publishes the box and its corner mark, containers and nothing stateful', () => {
    expect(Object.keys(IconSlots)).toEqual(['glyph', 'mark'])
    for (const slot of Object.values(IconSlots)) {
      expect(slot.capability).toBe(Capability.Container)
    }
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
    expect(css({})).toContain(`--_fk-icon-size:${Theme.ladder('icon')}`)
    expect(css({})).toContain('inline-size:var(--_fk-icon-size)')
    expect(css({ size: 'sm' })).toContain('--_fk-icon-size:var(--fk-size-sm)')
  })

  it.each(['xs', 'sm', 'md', 'lg', 'xl'] as const)(
    'has the %s step of the one size ladder',
    size => {
      expect(css({ size })).toContain(`--_fk-icon-size:var(--fk-size-${size})`)
    },
  )

  it('makes a tile twice the icon only with a surface', () => {
    expect(css({})).not.toContain('calc(var(--_fk-icon-size) * 2)')
    for (const surface of ['outline', 'soft', 'solid', 'raised'] as const) {
      expect(css({ surface }), surface).toContain('inline-size:calc(var(--_fk-icon-size) * 2)')
    }
  })

  it.each([
    ['accent', 'accent'],
    ['info', 'info'],
    ['success', 'success'],
    ['warning', 'warning'],
    ['danger', 'error'],
  ] as const)('tones %s from its family', (tone, family) => {
    expect(css({ tone })).toContain(`--_fk-icon-fill:var(--fk-${family}-default)`)
  })

  it('rounds a circle fully and a square at the small corner', () => {
    expect(css({ shape: 'circle' })).toContain('border-radius:var(--fk-radius-full)')
    expect(css({ shape: 'square' })).toContain('border-radius:var(--fk-radius-sm)')
  })
})

describe('Icon view: a drawing of your own and a mark', () => {
  it('draws a drawing of your own in place of an icon', () => {
    const drawn = view({ glyph: h.span([], ['AB']) }, h)
    expect(Inert.text(drawn)).toBe('AB')
    expect(Inert.byTag(drawn, 'path')).toHaveLength(0)
    expect(Inert.value(drawn, 'aria-hidden')).toBe('true')
  })

  it('draws a corner mark in its own element after the drawing', () => {
    const drawn = view({ icon: check, label: 'Alerts', mark: h.span([], ['3']) }, h)
    const spans = Inert.byTag(drawn, 'span')
    expect(Inert.text(spans[spans.length - 1])).toBe('3')
    expect(Inert.byTag(view({ icon: check }, h), 'span')).toHaveLength(1)
  })
})
