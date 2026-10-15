/**
 * Badge: one Container slot, a view carrying its tone in `data-tone`, over
 * the option-driven recipe that maps values to families.
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { BadgeSlots, view } from '../src/badge.js'
import { Recipes } from '../src/index.js'
import type { BadgeAppearance } from '../src/recipes/index.js'

const h = SlotView.inertBuilder<never>()

const tones = { info: 'info', success: 'success', warning: 'warning', error: 'error' } as const

describe('BadgeSlots', () => {
  it('publishes one container and nothing stateful', () => {
    expect(Object.keys(BadgeSlots)).toEqual(['badge'])
    expect(BadgeSlots.badge?.capability).toBe(Capability.Container)
  })
})

describe('Badge view', () => {
  it('carries its tone in data-tone, or nothing without one', () => {
    const toned = view(
      {
        text: 'Live',
        tone: 'success',
        style: Style.forSlots(BadgeSlots)(Recipes.Badge({ attribute: 'data-tone', tones })),
      },
      h,
    )
    expect(Inert.byTag(toned, 'span')).toHaveLength(1)
    expect(Inert.value(Inert.byTag(toned, 'span')[0], 'data-tone')).toBe('success')
    expect(Inert.text(toned)).toBe('Live')
    const plain = view({ text: 'New' }, h)
    expect(Inert.value(Inert.byTag(plain, 'span')[0], 'data-tone')).toBeUndefined()
  })
})

describe('Badge recipe', () => {
  const css = (appearance?: BadgeAppearance): string =>
    Style.forSlots(BadgeSlots)(Recipes.Badge({ attribute: 'data-tone', tones, appearance })).css

  it('tones mapped values, keeps the base for the rest', () => {
    const sheet = css()
    expect(sheet).toMatch(
      /\[data-tone="success"\]\{[^}]*--_fk-badge-tint:var\(--fk-success-subtle\)/,
    )
    expect(sheet).toContain('--_fk-badge-tint:var(--fk-surface-muted)')
    expect(sheet).toContain('border-radius:var(--fk-radius-xl)')
  })

  it('fills a tinted badge with its tone’s tint, and draws no dot', () => {
    const sheet = css('tinted')
    expect(sheet).toContain('background:var(--_fk-badge-tint)')
    expect(sheet).toContain('color:var(--_fk-badge-ink)')
    expect(sheet).not.toContain('::before')
    expect(css()).toBe(sheet)
  })

  it('draws a dot badge as a tone dot before plain words, with no fill', () => {
    const sheet = css('dot')
    expect(sheet).toContain('background:transparent')
    expect(sheet).toContain('color:var(--fk-text-default)')
    expect(sheet).toMatch(/::before\{[^}]*background:var\(--_fk-badge-fill\)/)
  })

  it('rings an outline badge in its tone, inside its edge', () => {
    const sheet = css('outline')
    expect(sheet).toContain('box-shadow:inset 0 0 0 var(--fk-border-thin) var(--_fk-badge-line)')
    expect(sheet).toMatch(/\[data-tone="error"\]\{[^}]*--_fk-badge-line:var\(--fk-error-outline\)/)
  })

  it('fills a solid badge with its tone, words in the tone’s text on fill', () => {
    const sheet = css('solid')
    expect(sheet).toContain('background:var(--_fk-badge-fill)')
    expect(sheet).toContain('color:var(--_fk-badge-on-fill)')
    expect(sheet).toMatch(
      /\[data-tone="success"\]\{[^}]*--_fk-badge-fill:var\(--fk-success-default\)/,
    )
  })
})
