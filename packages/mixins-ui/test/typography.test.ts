/**
 * Typography: one Container slot, a view speaking each level through its
 * own element, and a recipe setting the scale outright (no prose container
 * to inherit from).
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { TypographySlots, view, type TypographyLevel } from '../src/typography.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()

const styled = (level: TypographyLevel) =>
  view({ level, text: 'Words', style: Style.forSlots(TypographySlots)(Recipes.Typography({})) }, h)

describe('TypographySlots', () => {
  it('publishes one container and nothing stateful', () => {
    expect(Object.keys(TypographySlots)).toEqual(['text'])
    expect(TypographySlots.text?.capability).toBe(Capability.Container)
  })
})

describe('Typography view', () => {
  it.each([
    ['h1', 'h1'],
    ['h2', 'h2'],
    ['h3', 'h3'],
    ['h4', 'h4'],
    ['lead', 'p'],
    ['body', 'p'],
    ['small', 'small'],
    ['muted', 'p'],
    ['quote', 'blockquote'],
    ['code', 'code'],
  ] as const)('speaks %s through %s', (level, tag) => {
    const voice = styled(level)
    expect(Inert.byTag(voice, tag)).toHaveLength(1)
    expect(Inert.text(voice)).toBe('Words')
  })
})

describe('Typography recipe', () => {
  const css = (selection: Parameters<typeof Recipes.Typography>[0]): string =>
    Style.forSlots(TypographySlots)(Recipes.Typography(selection)).css

  it('steps headings down the scale, in the theme’s heading font, weight and tracking', () => {
    expect(css({ level: 'h1' })).toContain('font-size:var(--fk-size-4xl)')
    expect(css({ level: 'h4' })).toContain('font-size:var(--fk-size-xl)')
    for (const level of ['h1', 'display', 'title', 'subtitle'] as const) {
      expect(css({ level }), level).toContain('font-family:var(--fk-font-heading)')
    }
    expect(css({ level: 'h1' })).toContain('font-weight:var(--fk-weight-heading)')
    expect(css({ level: 'h1' })).toContain('letter-spacing:var(--fk-tracking-heading)')
    // Display a step bolder than the other headings, whatever their weight.
    expect(css({ level: 'display' })).toContain('font-weight:calc(var(--fk-weight-heading) + 100)')
  })

  it('quiets asides and sets code apart', () => {
    expect(css({ level: 'muted' })).toContain('color:var(--fk-text-muted)')
    expect(css({ level: 'code' })).toContain('background:var(--fk-surface-muted)')
  })

  it('caps reading levels at the theme’s measure and aligns them', () => {
    for (const level of ['body', 'lead', 'quote'] as const)
      expect(css({ level }), level).toContain('max-inline-size:var(--fk-reading-measure)')
    for (const level of ['h1', 'body', 'caption'] as const)
      expect(css({ level }), level).toContain('text-align:var(--fk-reading-align)')
  })

  it('grows the interface roles with fluid type, and leaves the body role fixed', () => {
    for (const level of ['display', 'title', 'subtitle'] as const)
      expect(css({ level }), level).toContain('var(--fk-fluid-progress)')
    expect(css({ level: 'body' })).not.toContain('var(--fk-fluid-progress)')
  })
})
