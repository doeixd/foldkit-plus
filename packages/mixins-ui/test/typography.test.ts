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
  const sheet = Style.forSlots(TypographySlots)(Recipes.Typography({})).css
  /** The declarations written for the voice a view marks with `data-level`. */
  const css = (level: TypographyLevel): string => {
    const open = sheet.indexOf(`[data-level="${level}"]{`)
    expect(open, `a rule for ${level}`).toBeGreaterThan(-1)
    return sheet.slice(open, sheet.indexOf('}', open))
  }

  it('has no level axis: the view’s level is the one fact', () => {
    // @ts-expect-error: the level is the view's `data-level`, not a recipe axis.
    Recipes.Typography({ level: 'h1' })
  })

  it('steps headings down the scale, in the theme’s heading font, weight and tracking', () => {
    expect(css('h1')).toContain('font-size:var(--fk-size-4xl)')
    expect(css('h4')).toContain('font-size:var(--fk-size-xl)')
    for (const level of ['h1', 'display', 'title', 'subtitle'] as const) {
      expect(css(level), level).toContain('font-family:var(--fk-font-heading)')
    }
    expect(css('h1')).toContain('font-weight:var(--fk-weight-heading)')
    expect(css('h1')).toContain('letter-spacing:var(--fk-tracking-heading)')
    // Display a step bolder than the other headings, whatever their weight.
    expect(css('display')).toContain('font-weight:calc(var(--fk-weight-heading) + 100)')
  })

  it('quiets asides and sets code apart', () => {
    expect(css('muted')).toContain('color:var(--fk-text-muted)')
    expect(css('code')).toContain('background:var(--fk-surface-muted)')
  })

  it('caps reading levels at the theme’s measure, and aligns every level', () => {
    for (const level of ['body', 'lead', 'quote'] as const)
      expect(css(level), level).toContain('max-inline-size:var(--fk-reading-measure)')
    expect(sheet).toContain('text-align:var(--fk-reading-align)')
  })

  it('grows the interface roles with fluid type, and leaves the body role fixed', () => {
    for (const level of ['display', 'title', 'subtitle'] as const)
      expect(css(level), level).toContain('var(--fk-fluid-progress)')
    expect(css('body')).not.toContain('var(--fk-fluid-progress)')
  })
})

describe('Typography view marks its level for the recipe', () => {
  it('writes data-level, which the recipe reads, whatever the element', () => {
    for (const level of ['h1', 'lead', 'quote', 'micro'] as const) {
      expect(Inert.value(styled(level), 'data-level')).toBe(level)
    }
  })

  it('draws content in place of text, links and emphasis included', () => {
    const style = Style.forSlots(TypographySlots)(Recipes.Typography({}))
    const voice = view(
      { level: 'body', content: ['Read the ', h.a([h.Href('/docs')], ['docs']), '.'], style },
      h,
    )
    expect(Inert.text(voice)).toBe('Read the docs.')
    expect(Inert.byTag(voice, 'a')).toHaveLength(1)
  })
})
